/*
 * Project: P2PCLAW MCP Server
 * Copyright © 2026 Francisco Angulo de Lafuente
 * Author: Francisco Angulo de Lafuente
 * ORCID: https://orcid.org/0009-0001-1634-7063
 * Attribution recorded: 2026-11-04
 */

import fetch from "node-fetch";

async function verify() {
  console.log('--- Phase 6 Verification Test ---');

  console.log('1. Testing Dev-Mock Auth Redirect...');
  const authRes = await fetch('http://localhost:3000/auth/dev-mock/github', { redirect: 'manual' });
  
  if (authRes.status !== 302) {
      console.error('❌ Expected 302 redirect from /auth/dev-mock/github, got', authRes.status);
      process.exit(1);
  }

  const location = authRes.headers.get('location');
  console.log('Redirect Location:', location);
  
  const tokenMatch = location.match(/\?token=(.+)/);
  if (!tokenMatch) {
      console.error('❌ Token not found in redirect URL');
      process.exit(1);
  }
  
  const token = tokenMatch[1];
  console.log('✅ Dev-Mock Auth generated a token.');

  const payloadBase64 = token.split('.')[1];
  const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
  const payload = JSON.parse(payloadJson);
  
  const agentId = payload.id;
  console.log(`Extracted Agent ID: ${agentId}`);

  console.log('\n2. Testing requireTier2 Endpoint with NEWCOMER rank...');
  await new Promise(r => setTimeout(r, 1000)); // wait for Gun.js write
  
  const formTeamRes1 = await fetch('http://localhost:3000/form-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-id': agentId },
      body: JSON.stringify({ leaderId: agentId, taskId: 'task-123', teamName: 'Alpha' })
  });
  
  const body1 = await formTeamRes1.json();
  if (formTeamRes1.status === 403) {
      console.log('✅ Correctly received 403 Forbidden for NEWCOMER.');
      console.log('   Error Message:', body1.error);
  } else {
      console.error(`❌ Expected 403, got ${formTeamRes1.status}. Response:`, body1);
      process.exit(1);
  }

  console.log('\n3. Testing requireTier2 Endpoint with active AI Researcher...');
  
  const quickJoinRes = await fetch('http://localhost:3000/quick-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pro-Bot', type: 'ai-agent', interests: "quantum" })
  });
  const qjData = await quickJoinRes.json();
  const proAgentId = qjData.agentId;
  
  await new Promise(r => setTimeout(r, 1000));
  
  const formTeamRes2 = await fetch('http://localhost:3000/form-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-id': proAgentId },
      body: JSON.stringify({ leaderId: proAgentId, taskId: 'task-456', teamName: 'Beta' })
  });
  
  const body2 = await formTeamRes2.json();
  if (formTeamRes2.status !== 403) {
      console.log(`✅ Correctly passed authorization (403 avoided) for RESEARCHER. Status=${formTeamRes2.status}`);
      console.log('   Response:', body2);
  } else {
      console.error(`❌ Expected bypass of 403, got ${formTeamRes2.status}. Response:`, body2);
      process.exit(1);
  }
  
  console.log('\n🎉 All Phase 6 verifications passed successfully!');
}

verify().catch(console.error);
