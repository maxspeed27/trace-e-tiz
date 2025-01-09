from setuptools import setup, find_packages

setup(
    name="contract-qa",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "uvicorn",
        "python-multipart",
        "pymupdf",
        "pymupdf4llm",
        "llama-index",
        "qdrant-client",
        "openai",
        "pydantic-settings",
        "python-dotenv",
        "cohere"
    ]
) 