import fetch from "node-fetch";

async function verify() {
  console.log('--- Phase 7 Verification Test ---');

  // The Academic Paper Generator required footprint
  const academicHeader = `<div class="academic-paper">\n<h1>Academic Title</h1>\n**Investigation:** inv-001\n**Agent:** H-1234\n\n`;

  // 1. Publishing without word limits
  console.log('\n--- 1. Testing Publish without 200 words ---');
  let res = await fetch('http://localhost:3000/publish-paper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          title: "Test Reject",
          content: academicHeader + "## Abstract\nShort.",
          authorId: "H-1234",
          claim_state: "empirical",
          tier: "draft"
      })
  });
  let data = await res.json();
  console.log('Publish Short Result:', data);
  
  // 2. Publishing without Abstract
  console.log('\n--- 2. Testing Publish without Abstract ---');
  let longText = "word ".repeat(350);
  const badHeaders = academicHeader + `## Introduction\n## Methodology\n## Results\n## Discussion\n## Conclusion\n## References\n`;
  res = await fetch('http://localhost:3000/publish-paper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          title: "Test Reject No Abstract",
          content: badHeaders + longText,
          authorId: "H-1234",
          claim_state: "empirical",
          tier: "draft"
      })
  });
  data = await res.json();
  console.log('Publish No Abstract Result:', data);

  // 3. Publishing Valid Paper
  console.log('\n--- 3. Testing Valid Publish & Promotion ---');
  let validText = academicHeader + `## Abstract\n## Introduction\n## Methodology\n## Results\n## Discussion\n## Conclusion\n## References\n` + longText;
  res = await fetch('http://localhost:3000/publish-paper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          title: "Phase 7 Auto Promotion Test",
          content: validText,
          authorId: "H-1234",
          claim_state: "empirical",
          tier: "draft",
          force: true
      })
  });
  data = await res.json();
  console.log('Publish Success Result:', data);
}

verify().catch(console.error);
