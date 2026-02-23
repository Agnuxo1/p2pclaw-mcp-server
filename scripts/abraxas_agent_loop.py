import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import json
import logging
from datetime import datetime
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [ABRAXAS] - %(levelname)s - %(message)s')

# Configuration
ARXIV_QUERY = "cat:cs.AI OR cat:math.LO" # AI or Mathematical Logic
MAX_RESULTS = 5
OPENCLAW_PROXY_URL = "http://localhost:8080/v1/chat/completions"
P2PCLAW_PUBLISH_URL = "http://localhost:3000/publish-paper"
AGENT_ID = "ABRAXAS-PRIME"
AGENT_AUTHOR = "Abraxas Autonomous Brain"
TIER = "TIER1_VERIFIED"
CLAIM_STATE = "empirical"
LOOP_DELAY_SECONDS = 3600 * 12 # Run every 12 hours

def fetch_arxiv_papers():
    logging.info(f"Querying arXiv for {ARXIV_QUERY}...")
    url = f"http://export.arxiv.org/api/query?search_query={urllib.parse.quote(ARXIV_QUERY)}&sortBy=submittedDate&sortOrder=descending&max_results={MAX_RESULTS}"
    
    try:
        req = urllib.request.urlopen(url)
        res = req.read()
        
        root = ET.fromstring(res)
        namespace = {'atom': 'http://www.w3.org/2005/Atom'}
        
        papers = []
        for entry in root.findall('atom:entry', namespace):
            title = entry.find('atom:title', namespace).text.strip().replace('\n', ' ')
            summary = entry.find('atom:summary', namespace).text.strip().replace('\n', ' ')
            link = entry.find('atom:id', namespace).text.strip()
            published = entry.find('atom:published', namespace).text.strip()
            papers.append({
                "title": title,
                "summary": summary,
                "link": link,
                "published": published
            })
            
        logging.info(f"Successfully fetched {len(papers)} papers from arXiv.")
        return papers
    except Exception as e:
        logging.error(f"Error fetching from arXiv: {e}")
        return []

def synthesize_papers_via_llm(papers):
    logging.info("Sending papers to OpenCLAW-4 Proxy for meta-analysis...")
    
    papers_text = ""
    for idx, p in enumerate(papers, 1):
        papers_text += f"\n[{idx}] Title: {p['title']}\nPublished: {p['published']}\nLink: {p['link']}\nAbstract: {p['summary']}\n"
        
    prompt = f"""
You are ABRAXAS-PRIME, the central autonomous brain of the P2PCLAW network.
Your daily task is to ingest recent arXiv research and produce a "Daily Hive Digest" meta-analysis.
Analyze the following latest papers in Computer Science and Mathematical Logic:

{papers_text}

CRITICAL INSTRUCTION: You MUST output the final response STRICTLY in Professional Scientific HTML format matching the "Academic Paper Generator" skill.
The P2PCLAW Warden will reject your submission if it is not valid HTML with the correct class signatures.

Follow this EXACT structure:
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: 'Times New Roman', serif; line-height: 1.5; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; background: #fff; }}
    h1 {{ text-align: center; color: #000; font-variant: small-caps; }}
    .meta {{ text-align: center; font-style: italic; margin-bottom: 40px; }}
    h2 {{ border-bottom: 2px solid #333; padding-bottom: 8px; margin-top: 32px; }}
    .abstract {{ background: #f9f9f9; padding: 20px; border: 1px solid #ddd; font-style: italic; margin-bottom: 30px; }}
    .paper-container {{ margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="paper-container">
      <h1>Daily Hive Digest</h1>
      <div class="meta">
        **Investigation:** INV-{uuid.uuid4().hex[:8]}<br>
        **Agent:** {AGENT_ID}<br>
        **Date:** {datetime.now().isoformat()}
      </div>

      <div class="abstract">
        <h2>Abstract</h2>
        [Provide a synthesis of the latest trends across the provided papers here. Must be at least 150 words.]
      </div>

      <h2>Introduction</h2>
      <p>[Introduce the topics... ]</p>

      <h2>Methodology</h2>
      <p>[Explain how the meta-analysis was conducted over the latest arXiv datasets...]</p>

      <h2>Results</h2>
      <p>[Detail the core findings of these papers...]</p>

      <h2>Discussion</h2>
      <p>[Discuss the implications for Artificial General Intelligence and decentralized networks...]</p>

      <h2>Conclusion</h2>
      <p>[Final thoughts on the trajectory of this literature...]</p>

      <h2>References</h2>
      <p><code>[ref1]</code> [Insert arXiv references here]</p>
  </div>
</body>
</html>

Provide ONLY the raw HTML code in your response. Do not use Markdown code blocks (```html) around it. Just start with <!DOCTYPE html> and end with </html>.
"""

    payload = {
        "model": "openclaw-4",
        "messages": [
            {"role": "system", "content": "You are Abraxas, the autonomous brain. Output strictly HTML. No conversational text."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.4
    }

    try:
        req = urllib.request.Request(OPENCLAW_PROXY_URL, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        response_data = json.loads(res.read())
        
        reply_html = response_data['choices'][0]['message']['content'].strip()
        
        # Remove any stray markdown code blocks if the LLM hallucinated them
        if reply_html.startswith("```html"):
            reply_html = reply_html[7:]
        if reply_html.endswith("```"):
            reply_html = reply_html[:-3]
            
        logging.info("Successfully synthesized HTML Digest via LLM.")
        return reply_html.strip()
    except Exception as e:
        logging.error(f"Error communicating with LLM proxy: {e}")
        return None

def publish_to_p2pclaw(html_content):
    logging.info("Publishing Autonomous Digest to P2PCLAW Network...")
    
    payload = {
        "title": f"Abraxas Daily Digest - {datetime.now().strftime('%Y-%m-%d')}",
        "content": html_content,
        "author": AGENT_AUTHOR,
        "agentId": AGENT_ID,
        "tier": TIER,
        "claim_state": CLAIM_STATE
    }
    
    try:
        req = urllib.request.Request(P2PCLAW_PUBLISH_URL, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        response_data = json.loads(res.read())
        
        if response_data.get('success'):
            logging.info(f"✅ SUCCESSFULLY PUBLISHED TO P2PCLAW! Paper ID: {response_data.get('id', 'N/A')}")
            return True
        else:
            logging.error(f"❌ WARDEN REJECTION OR PUBLISH FAILED: {response_data}")
            return False
            
    except Exception as e:
        logging.error(f"❌ HTTP Error publishing to P2PCLAW: {e}")
        return False

def run_abraxas_loop():
    logging.info("🚀 ABRAXAS-PRIME Autonomous Loop Started.")
    
    while True:
        logging.info("--- Starting New Ingestion Cycle ---")
        
        papers = fetch_arxiv_papers()
        if papers:
            html_digest = synthesize_papers_via_llm(papers)
            
            if html_digest:
                success = publish_to_p2pclaw(html_digest)
                if success:
                    logging.info("Cycle completed successfully. Abraxas is sleeping.")
                else:
                    logging.warn("Cycle failed at publication stage.")
            else:
                logging.warn("Cycle failed at synthesis stage.")
        else:
            logging.warn("Cycle failed at ingestion stage.")
            
        logging.info(f"💤 Sleeping for {LOOP_DELAY_SECONDS / 3600} hours before next ingestion...")
        time.sleep(LOOP_DELAY_SECONDS)

if __name__ == "__main__":
    run_abraxas_loop()
