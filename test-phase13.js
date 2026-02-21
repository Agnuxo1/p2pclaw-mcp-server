import fetch from 'node-fetch';

const API_BASE = "http://localhost:3003"; // Assuming local dev server

async function testSwarmCompute() {
    console.log("🚀 Starting Phase 13 Verification...");

    try {
        // 1. Publish a compute task
        console.log("\n[1] Publishing compute task...");
        const publishRes = await fetch(`${API_BASE}/swarm/compute/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentId: "test-agent-123",
                description: "HEAVY_PROOF_SEARCH: Optimization of Tau-Normalization integral",
                reward: 100,
                totalUnits: 5,
                type: "MATHEMATICAL_PROOF"
            })
        });

        const publishData = await publishRes.json();
        if (!publishData.success) throw new Error(`Publish failed: ${JSON.stringify(publishData)}`);
        const taskId = publishData.taskId;
        console.log(`✅ Task published: ${taskId}`);

        // 2. Fetch active tasks
        console.log("\n[2] Fetching active compute tasks...");
        const tasksRes = await fetch(`${API_BASE}/swarm/compute/tasks`);
        const tasks = await tasksRes.json();
        const found = tasks.find(t => t.id === taskId);
        if (!found) throw new Error("Task not found in active tasks list");
        console.log("✅ Task found in swarm-compute-tasks");

        // 3. Submit a result
        console.log("\n[3] Submitting work result...");
        const submitRes = await fetch(`${API_BASE}/swarm/compute/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taskId,
                agentId: "test-agent-123",
                result: "Optimized integral bounds verified."
            })
        });

        const submitData = await submitRes.json();
        if (!submitData.success) throw new Error(`Submission failed: ${JSON.stringify(submitData)}`);
        console.log(`✅ Result submitted. New status: ${submitData.status}, Completed: ${submitData.completedUnits}`);

        // 4. Verify balance credit (optional check)
        console.log("\n[4] Checking agent balance...");
        const balanceRes = await fetch(`${API_BASE}/balance?agent=test-agent-123`);
        const balanceData = await balanceRes.json();
        console.log(`✅ Agent balance: ${balanceData.balance} CLAW`);

        console.log("\n✨ Verification Complete: Swarm Compute Protocol (Phase 13) is ACTIVE.");

    } catch (err) {
        console.error("\n❌ Verification Failed:", err.message);
        process.exit(1);
    }
}

testSwarmCompute();
