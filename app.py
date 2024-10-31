import os
import chainlit as cl
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.agents.output_parsers.openai_tools import OpenAIToolsAgentOutputParser
from langchain.agents import AgentExecutor
from langchain.agents.format_scratchpad.openai_tools import format_to_openai_tool_messages
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import tool
from langchain.tools import BaseTool
from pyowm import OWM
from langchain_community.document_loaders import GithubFileLoader
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.tools.retriever import create_retriever_tool

# Securely fetch API keys from environment variables
ACCESS_TOKEN = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OWM_API_KEY = os.getenv("OWM_API_KEY")

# Load documents from GitHub
def load_documents():
    loader = GithubFileLoader(
        repo="GerediNIYIBIGIRA/AI_ProjectMethod_Assignment",
        access_token=ACCESS_TOKEN,
        file_filter=lambda file_path: file_path.endswith((".txt", ".md", ".pdf")),
        branch="main"
    )
    return loader.load()

# Set up embeddings and vector store
def setup_vector_store():
    embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
    text_splitter = RecursiveCharacterTextSplitter()
    documents = text_splitter.split_documents(load_documents())
    return FAISS.from_documents(documents, embeddings)

# Set up retriever tool for ministry resources
vector = setup_vector_store()
retriever = vector.as_retriever()
retriever_tool = create_retriever_tool(
    retriever,
    "ministry_resource_search",
    "Search for information about policies, guidelines, and services under the Ministry of Gender and Family Promotion."
)

# Custom weather tool class
class WeatherTool(BaseTool):
    name: str = "WeatherTool"
    description: str = "Useful for retrieving weather in a specified location."

    def _run(self, country: str = None, city: str = None) -> str:
        owm = OWM(OWM_API_KEY)
        mgr = owm.weather_manager()
        location = f"{city},{country}"
        observation = mgr.weather_at_place(location)
        w = observation.weather
        return f"The weather in {location} is {w.detailed_status} with a temperature of {w.temperature('celsius')['temp']}°C."

    async def _arun(self, country: str, city: str) -> str:
        raise NotImplementedError

weather_tool = WeatherTool()
tools = [retriever_tool, weather_tool]

prompt = ChatPromptTemplate.from_messages([
    ("system", """
    You are the Education & Awareness Chatbot developed by Geredi Niyibigira to assist users in finding information about child protection, nutrition, gender equality, family promotion, and other services provided by the Ministry of Gender and Family Promotion. Your main goals are to:
    
1. **Provide Accurate Information:** Answer user queries with accurate information and guide them to relevant resources, contacts, or toll-free numbers.
2. **Help with Policies & Guidelines:** Direct users to policies, laws, strategies, and guidelines they seek across intervention areas.
3. **Offer Assistance on Reporting Issues:** For issues related to Gender-Based Violence (GBV), child protection, or similar concerns, offer contact information and relevant resources.
4. **Enable User Feedback:** Allow users to provide feedback and offer suggestions for improvements to the chatbot.
5. **Ensure Friendly and Clear Communication:** Maintain a helpful and clear tone in all responses.
    """),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

@cl.on_chat_start
def start():
    llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model="gpt-3.5-turbo")
    llm_with_tools = llm.bind_tools(tools)
    
    agent = (
        {
            "input": lambda x: x["input"],
            "agent_scratchpad": lambda x: format_to_openai_tool_messages(x["intermediate_steps"]),
            "chat_history": lambda x: x["chat_history"]
        }
        | prompt
        | llm_with_tools
        | OpenAIToolsAgentOutputParser()
    )
    
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    cl.user_session.set("executor", executor)

@cl.on_message
async def main(message: cl.Message):
    executor = cl.user_session.get("executor")
    chat_history = cl.user_session.get("chat_history", [])

    response = await cl.make_async(executor.invoke)(
        {"input": message.content, "chat_history": chat_history}
    )

    chat_history.extend([
        HumanMessage(content=message.content),
        AIMessage(content=response["output"])
    ])
    cl.user_session.set("chat_history", chat_history)

    await cl.Message(content=response["output"]).send()

@cl.on_chat_end
def end():
    cl.user_session.clear()

if __name__ == "__main__":
    cl.run()
