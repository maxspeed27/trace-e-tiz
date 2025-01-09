from pathlib import Path

# Load API keys from .env file
def load_api_keys() -> dict:
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        raise FileNotFoundError(
            "Please create a .env file in the root directory with your API keys"
        )
    
    keys = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                key, value = line.split('=', 1)
                keys[key.strip()] = value.strip().strip('"\'')
    
    return keys

API_KEYS = load_api_keys()
OPENAI_API_KEY = API_KEYS.get('OPENAI_API_KEY')
COHERE_API_KEY = API_KEYS.get('COHERE_API_KEY') 