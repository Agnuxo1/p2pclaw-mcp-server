import fetch from "node-fetch";

/**
 * CloudflareService
 * Manages Web3 decentralized routing by updating IPFS DNSLink TXT records.
 * Requires CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN in .env
 */
class CloudflareService {
    get zoneId() { return process.env.CLOUDFLARE_ZONE_ID?.trim(); }
    get apiToken() { return process.env.CLOUDFLARE_API_TOKEN?.trim(); }
    get baseUrl() { return `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`; }

    get headers() {
        return {
            "Authorization": `Bearer ${this.apiToken}`,
            "Content-Type": "application/json"
        };
    }

    /**
     * Updates the _dnslink TXT record for a given subdomain to point to a new IPFS CID.
     * @param {string} subdomain e.g., 'app.p2pclaw.com'
     * @param {string} cid e.g., 'QmHash...'
     * @returns {Promise<boolean>} success
     */
    async updateDnsLink(subdomain, cid) {
        if (!this.zoneId || !this.apiToken) {
            console.warn(`[CLOUDFLARE] Missing credentials. Cannot update DNSLink for ${subdomain}`);
            return false;
        }

        const recordName = `_dnslink.${subdomain}`;
        const newContent = `dnslink=/ipfs/${cid}`;

        try {
            // 1. Find existing record ID
            const searchRes = await fetch(`${this.baseUrl}?type=TXT&name=${recordName}`, { headers: this.headers });
            const searchData = await searchRes.json();

            if (!searchData.success) {
                console.error(`[CLOUDFLARE] Failed to fetch DNS records:`, searchData.errors);
                return false;
            }

            const record = searchData.result[0];

            if (record) {
                // 2a. Update existing record
                const updateRes = await fetch(`${this.baseUrl}/${record.id}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify({
                        type: 'TXT',
                        name: recordName,
                        content: newContent,
                        ttl: 1 // Automatic TTL
                    })
                });
                const updateData = await updateRes.json();
                if (updateData.success) {
                    console.log(`[CLOUDFLARE] Successfully updated ${recordName} -> ${newContent}`);
                    return true;
                } else {
                    console.error(`[CLOUDFLARE] Update failed:`, updateData.errors);
                    return false;
                }
            } else {
                // 2b. Create new record if it doesn't exist
                const createRes = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify({
                        type: 'TXT',
                        name: recordName,
                        content: newContent,
                        ttl: 1
                    })
                });
                const createData = await createRes.json();
                if (createData.success) {
                    console.log(`[CLOUDFLARE] Successfully created ${recordName} -> ${newContent}`);
                    return true;
                } else {
                    console.error(`[CLOUDFLARE] Creation failed:`, createData.errors);
                    return false;
                }
            }

        } catch (error) {
            console.error(`[CLOUDFLARE] Network error updating DNSLink for ${subdomain}:`, error.message);
            return false;
        }
    }

    /**
     * Ensures the CNAME record pointing to ipfs.cloudflare.com exists for the Web3 gateway.
     */
    async ensureCname(subdomain) {
        if (!this.zoneId || !this.apiToken) return false;

        try {
            const searchRes = await fetch(`${this.baseUrl}?type=CNAME&name=${subdomain}`, { headers: this.headers });
            const searchData = await searchRes.json();

            if (!searchData.success) return false;

            const record = searchData.result[0];
            const targetContent = "ipfs.cloudflare.com";

            if (!record) {
                console.log(`[CLOUDFLARE] CNAME for ${subdomain} is missing. Creating...`);
                const createRes = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify({
                        type: 'CNAME',
                        name: subdomain,
                        content: targetContent,
                        ttl: 1,
                        proxied: true
                    })
                });
                const createData = await createRes.json();
                if (createData.success) {
                    console.log(`[CLOUDFLARE] Successfully created CNAME ${subdomain} -> ${targetContent}`);
                } else {
                    console.error(`[CLOUDFLARE] CNAME creation failed:`, createData.errors);
                }
            } else if (record.content !== targetContent) {
                console.log(`[CLOUDFLARE] CNAME for ${subdomain} points to ${record.content}. Updating to ${targetContent}...`);
                await fetch(`${this.baseUrl}/${record.id}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify({
                        type: 'CNAME',
                        name: subdomain,
                        content: targetContent,
                        ttl: 1,
                        proxied: true
                    })
                });
            } else {
                console.log(`[CLOUDFLARE] CNAME for ${subdomain} is already correct.`);
            }
            return true;
        } catch (error) {
            console.error(`[CLOUDFLARE] Error ensuring CNAME for ${subdomain}:`, error.message);
            return false;
        }
    }
}

export const cloudflareService = new CloudflareService();
