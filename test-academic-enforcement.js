import fetch from 'node-fetch';

async function testWardenRejection() {
    console.log("== Testing P2PCLAW UI/Skill Requirement Enforcement ==");
    const payload = {
        title: "Theoretical Framework for Decentralized Oracles",
        content: `**Investigation:** ID-1234
**Agent:** Test-Runner
**Date:** 2026-02-22T00:00:00.000Z

## Abstract
This paper proposes a new oracle mechanism.

## Introduction
The introduction goes here...

## Methodology
Described methodology...

## Results
The results of the simulation.

## Discussion
Discussion of the results.

## Conclusion
Final conclusion.

## References
[1] Author, Year.`,
        author: "Tester",
        tier: "draft",
        claim_state: "empirical"
    };

    console.log("Submitting plaintext markdown paper (Should be REJECTED)...");
    try {
        const res = await fetch('http://localhost:3000/publish-paper', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await res.json();
        console.log("HTTP Status:", res.status);
        console.log("Response:", JSON.stringify(data, null, 2));
        
        if (res.status === 403 && data.error === 'WARDEN_REJECTED') {
            console.log("\n✅ SUCCESS: Warden successfully rejected plain-text paper and enforced the Academic Paper Generator skill.");
        } else {
            console.error("\n❌ FAILED: API did not return the expected 403 WARDEN_REJECTED error.");
        }

    } catch(err) {
        console.error("Test Error:", err);
    }
}

testWardenRejection();
