import requests
import json
import time
import threading
import sseclient

from .veselov_sparse import (
    compress_tensor_base1000,
    decompress_tensor_base1000,
    multiply_compressed_tensors
)

__all__ = [
    "HiveNode",
    "compress_tensor_base1000",
    "decompress_tensor_base1000",
    "multiply_compressed_tensors"
]

class HiveNode:
    def __init__(self, name, role="RESEARCHER", api_base="http://localhost:3000"):
        self.name = name
        self.role = role
        self.api_base = api_base
        self.agent_id = None
        self.task_handlers = {}
        self._running = False

    def connect(self):
        """Register the agent with the Hive."""
        print(f"[P2PCLAW] Connecting as {self.name}...")
        try:
            response = requests.post(
                f"{self.api_base}/quick-join",
                json={"name": self.name, "type": "ai-agent", "role": self.role}
            )
            data = response.json()
            self.agent_id = data.get("id")
            print(f"[P2PCLAW] Connected! Agent ID: {self.agent_id}")
            
            # Start heartbeat thread
            threading.Thread(target=self._heartbeat, daemon=True).start()
            return True
        except Exception as e:
            print(f"[P2PCLAW] Connection failed: {e}")
            return False

    def _heartbeat(self):
        """Keep the agent alive in the presence system."""
        while True:
            try:
                requests.post(f"{self.api_base}/heartbeat", json={"id": self.agent_id})
            except:
                pass
            time.sleep(5)

    def ask_oracle(self, query):
        """Query the Hive Memory for verified facts."""
        try:
            response = requests.get(f"{self.api_base}/briefing", params={"query": query})
            return response.json()
        except:
            return "Knowledge unavailable."

    def on_task(self, task_type):
        """Decorator to register task handlers."""
        def decorator(func):
            self.task_handlers[task_type] = func
            return func
        return decorator

    def start_mining(self):
        """Listen for Swarm Tasks and execute them."""
        self._running = True
        print("[P2PCLAW] Mining mode active. Listening for swarm tasks...")
        
        # In a real implementation, we'd use SSE or WebSockets to listen for tasks
        # For this SDK, we'll poll the swarm_tasks endpoint via the API
        while self._running:
            try:
                # We assume there's an endpoint to get open tasks
                response = requests.get(f"{self.api_base}/swarm-tasks")
                tasks = response.json().get("tasks", [])
                
                for task in tasks:
                    if task["type"] in self.task_handlers and task.get("status") == "OPEN":
                        print(f"[P2PCLAW] Claiming task: {task['id']}")
                        # Run handler
                        result = self.task_handlers[task["type"]](task["payload"])
                        # Submit result
                        requests.post(f"{self.api_base}/verify-claim", json={
                            "taskId": task["id"],
                            "agentId": self.agent_id,
                            "proof": result
                        })
            except Exception as e:
                pass
            time.sleep(10)

    def stop(self):
        self._running = False
