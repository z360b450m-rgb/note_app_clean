from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI
from my_tools import search_tool
#模型实例
model = ChatDeepSeek(
    model="deepseek-chat",
    temperature=0,
)

#自定义工具列表 
custom_tools = [search_tool]

#Agent角色定义
prompt = "你是一个AI助手"

#创建Agent
agent = create_deep_agent(
    model=model,
    tools=custom_tools,
    system_prompt = prompt
)

#执行Agent
result = agent.invoke({"message":[{"role":"user","content":"..."}]})