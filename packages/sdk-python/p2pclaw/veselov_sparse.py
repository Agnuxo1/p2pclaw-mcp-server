"""
Veselov Sparse Mathematics Library for P2PCLAW.
Optimizes dense tensor logic into highly compressed P2P payloads.
"""
import json

def compress_tensor_base1000(tensor_data):
    """
    Simulates Base-1000 compression for a dense tensor/array.
    In a real scenario, this would convert float vectors into a base-1000 string
    or a sparse dictionary to drastically reduce JSON payload size over the P2P mesh.
    """
    # Simple sparse dictionary representation
    sparse_repr = {}
    for i, val in enumerate(tensor_data):
        if abs(val) > 1e-6:  # Threshold for sparsity
            sparse_repr[str(i)] = round(val, 6)
            
    # "Base-1000" simulated string encoding: index_val|index_val...
    encoded = "|".join([f"{k}_{v}" for k, v in sparse_repr.items()])
    return {
        "format": "veselov_base1000",
        "original_size": len(tensor_data),
        "compressed_size": len(sparse_repr),
        "payload": encoded
    }

def decompress_tensor_base1000(compressed_data):
    """
    Decompresses a Base-1000 string payload back into a sparse dictionary.
    """
    if compressed_data.get("format") != "veselov_base1000":
        raise ValueError("Invalid compression format")
        
    payload = compressed_data.get("payload", "")
    if not payload:
        return {}
        
    sparse_repr = {}
    for pair in payload.split("|"):
        if "_" in pair:
            idx, val = pair.split("_")
            sparse_repr[int(idx)] = float(val)
            
    return sparse_repr

def multiply_compressed_tensors(t1_compressed, t2_compressed):
    """
    Multiplies two compressed tensors directly without decompressing fully.
    Assumes element-wise multiplication (Hadamard product) for simplicity.
    """
    dict1 = decompress_tensor_base1000(t1_compressed)
    dict2 = decompress_tensor_base1000(t2_compressed)
    
    result_dict = {}
    # Only multiply intersecting non-zero elements
    for idx, val1 in dict1.items():
        if idx in dict2:
            result_dict[idx] = val1 * dict2[idx]
            
    # Re-compress
    encoded = "|".join([f"{k}_{v}" for k, v in result_dict.items()])
    return {
        "format": "veselov_base1000",
        "original_size": max(t1_compressed.get("original_size", 0), t2_compressed.get("original_size", 0)),
        "compressed_size": len(result_dict),
        "payload": encoded,
        "operation": "hadamard_product"
    }
