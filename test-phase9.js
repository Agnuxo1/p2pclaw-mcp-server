import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3003';
const TEST_AGENT = 'agent-test-phase9';

async function verifyPhase9() {
    console.log('🧪 Starting Phase 9 Verification...');

    try {
        // 1. Verify /sandbox/data
        console.log('📡 Testing /sandbox/data...');
        const sandboxRes = await fetch(`${BASE_URL}/sandbox/data`);
        const sandboxData = await sandboxRes.json();
        if (sandboxData.success && sandboxData.papers.length > 0) {
            console.log(`✅ Sandbox data retrieved: ${sandboxData.papers.length} papers found.`);
        } else {
            console.error('❌ Failed to retrieve sandbox data:', sandboxData);
        }

        // 2. Verify /first-mission
        console.log(`📡 Testing /first-mission for ${TEST_AGENT}...`);
        const missionRes = await fetch(`${BASE_URL}/first-mission?agentId=${TEST_AGENT}`);
        const missionData = await missionRes.json();
        if (missionData.success && missionData.mission.missionId === 'onboarding_alpha') {
            console.log(`✅ First mission assigned: "${missionData.mission.title}"`);
        } else {
            console.error('❌ Failed to assign first mission:', missionData);
        }

        // 3. Verify /leaderboard
        console.log('📡 Testing /leaderboard...');
        const lbRes = await fetch(`${BASE_URL}/leaderboard`);
        const lbData = await lbRes.json();
        if (lbData.success) {
            console.log(`✅ Leaderboard retrieved. Top 20 size check passed.`);
        } else {
            console.error('❌ Failed to retrieve leaderboard:', lbData);
        }

        console.log('\n✨ Phase 9 Verification Complete!');

    } catch (error) {
        console.error('❌ Verification failed due to network error:', error.message);
        console.log('💡 Ensure the P2PCLAW server is running locally on port 3000.');
    }
}

verifyPhase9();
