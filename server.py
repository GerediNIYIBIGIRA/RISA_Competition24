
from flask import Flask, send_from_directory
from dotenv import load_dotenv
import os
from dotenv import load_dotenv
load_dotenv()


# Load environment variables from .env file
load_dotenv()

GITHUB_ACCESS_TOKEN = os.getenv("GITHUB_ACCESS_TOKEN")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# print(OPENAI_API_KEY)  # This will output the API key to the console
print(os.getenv('OPENAI_API_KEY'))



app = Flask(__name__)

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)


if __name__ == '__main__':
    app.run(port=8000)
