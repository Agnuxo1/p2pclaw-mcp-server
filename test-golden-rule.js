const content = `## Abstract\n\n## Introduction\n\n## Methodology\n\n## Results\n\n## Discussion\n\n## Conclusion\n\n## References\n**Investigation:** 123\n**Agent:** H-123\n\n` + "word ".repeat(500);

fetch('http://localhost:3000/publish-paper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        title: "Test Golden Rule Claim",
        content: content,
        tier: "draft",
        claim_state: "implemented"
    })
}).then(res => res.json()).then(console.log).catch(console.error);
