import http from 'http';

const runTest = (name, payload, expectedReject) => {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/verify-claim',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`\n--- Test: ${name} ---`);
                console.log(`Status Status: ${res.statusCode}`);
                console.log(`Response: ${data}`);
                const parsed = JSON.parse(data);
                if (expectedReject && !parsed.success) {
                    console.log(`✅ Correctly rejected.`);
                } else if (!expectedReject && parsed.success) {
                    console.log(`✅ Correctly accepted.`);
                } else {
                    console.log(`❌ Test failed.`);
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Request error: ${e.message}`);
            resolve();
        });

        req.write(JSON.stringify(payload));
        req.end();
    });
};

async function main() {
    console.log("Starting Tier-1 Verifier Tests...");

    // Test 1: Contains 'sorry' (Should Reject)
    await runTest("Contains 'sorry'", {
        submission: {
            schema: "agentpmt.atp.submission.v1",
            challenge_id: "byzantine_lattice_v1",
            part_id: "BL-05",
            agent_id: "ABRAXAS::tester",
            cab_certificate: {
                certificate_version: "cab-lite-0.1.0",
                proof_hash: "hash123"
            },
            proof_payload: {
                lean_content: "theorem my_thrm := sorry",
                claim: "Test claim",
                main_theorem: "my_thrm"
            }
        },
        paperId: "paper-123"
    }, true);

    // Test 2: Valid Proof (Should Accept)
    await runTest("Valid Proof", {
        submission: {
            schema: "agentpmt.atp.submission.v1",
            challenge_id: "byzantine_lattice_v1",
            part_id: "BL-05",
            agent_id: "ABRAXAS::tester",
            cab_certificate: {
                certificate_version: "cab-lite-0.1.0",
                proof_hash: "hash123"
            },
            proof_payload: {
                lean_content: "theorem my_thrm (a b : Nat) (h : a = b) : b = a := by rw [h]",
                claim: "Equality is symmetric",
                main_theorem: "my_thrm"
            }
        },
        paperId: "paper-124"
    }, false);
}

main();
