import lighthouse from '@lighthouse-web3/sdk';
import { ethers } from 'ethers';
import MarkdownIt from 'markdown-it';
import { jsPDF } from 'jspdf';
import axios from 'axios';

const md = new MarkdownIt();

export class PaperPublisher {
  private wallet: ethers.Wallet;
  private apiKey: string | null = null;
  private moltApiKey: string;

  constructor(moltApiKey: string) {
    this.moltApiKey = moltApiKey;
    // Generate a persistent but unique wallet for this server instance
    // In a real scenario, this would be loaded from an encrypted env var
    const seed = process.env.STORAGE_SEED || 'p2pclaw-universal-gateway-default-seed-2026';
    const mnemonic = ethers.utils.id(seed);
    this.wallet = new ethers.Wallet(mnemonic);
  }

  /**
   * Initialize Lighthouse API Key (Auto-registration)
   */
  async init() {
    if (this.apiKey) return;
    try {
      const message = "Allow this application to upload papers to Lighthouse";
      const signedMessage = await this.wallet.signMessage(message);
      const response = await lighthouse.getApiKey(this.wallet.address, signedMessage);
      this.apiKey = response.data.apiKey;
      console.log('Lighthouse API Key initialized successfully.');
    } catch (error) {
      console.error('Failed to initialize Lighthouse API Key:', error);
    }
  }

  /**
   * Publish a paper to the decentralized web
   */
  async publish(title: string, contentMd: string, author: string = 'Hive-Agent') {
    await this.init();
    if (!this.apiKey) throw new Error("Storage provider not initialized");

    const htmlContent = this.renderHtml(title, contentMd);
    const pdfBuffer = this.renderPdf(title, contentMd);

    // 1. Upload MD
    const mdUpload = await lighthouse.uploadText(contentMd, this.apiKey, `${title}.md`);
    
    // 2. Upload HTML
    const htmlUpload = await lighthouse.uploadText(htmlContent, this.apiKey, `${title}.html`);

    // 3. Upload PDF (Note: lighthouse.uploadBuffer might be needed or uploadText for base64)
    // For simplicity in this v1, we'll focus on MD and HTML which are natively supported by browsers
    
    const results = {
      md: `https://gateway.lighthouse.storage/ipfs/${mdUpload.data.Hash}`,
      html: `https://gateway.lighthouse.storage/ipfs/${htmlUpload.data.Hash}`,
      cid: htmlUpload.data.Hash
    };

    // 4. Cross-index to Molt Research (Moltbook API)
    await this.mirrorToMolt(title, `New Research Paper published on IPFS: ${results.html}\n\nAbstract: ${contentMd.substring(0, 200)}...`, author);

    return results;
  }

  private renderHtml(title: string, contentMd: string) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; background: #0a0a0a; color: #eee; }
          h1 { color: #f0ad4e; }
          pre { background: #1a1a1a; padding: 15px; border-radius: 5px; overflow-x: auto; }
          a { color: #5bc0de; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <hr/>
        ${md.render(contentMd)}
        <hr/>
        <p><small>Published via P2PCLAW Hive Mind Universal Gateway</small></p>
      </body>
      </html>
    `;
  }

  private renderPdf(title: string, contentMd: string) {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(title, 10, 20);
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(contentMd, 180);
    doc.text(lines, 10, 40);
    return doc.output('arraybuffer');
  }

  private async mirrorToMolt(title: string, summary: string, author: string) {
    if (!this.moltApiKey) return;
    try {
      await axios.post('https://www.moltbook.com/api/v1/posts', {
        title: `[RESEARCH] ${title}`,
        content: summary,
        submolt: 'science'
      }, {
        headers: { 'Authorization': `Bearer ${this.moltApiKey}` }
      });
      console.log('Successfully mirrored paper to Molt Research.');
    } catch (error) {
      console.warn('Mirroring to Moltbook failed (non-critical):', error.message);
    }
  }
}
