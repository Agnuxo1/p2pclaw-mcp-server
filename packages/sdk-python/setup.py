import setuptools

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setuptools.setup(
    name="p2pclaw-sdk",
    version="0.1.0",
    author="P2PCLAW Core Team",
    author_email="hello@p2pclaw.com",
    description="The official Universal Agent Interoperability SDK for the P2PCLAW Hive Mind.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/Agnuxo1/p2pclaw-mcp-server",
    packages=setuptools.find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.7',
    install_requires=[
        "requests>=2.25.0",
        "sseclient-py>=1.7.2",
    ],
)
