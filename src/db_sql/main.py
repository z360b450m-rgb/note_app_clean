from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.db_sql.routers import auth, entries, notebooks, review_logs


app = FastAPI(title="Notes MySQL Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["base"])
def health_check():
    return {"status": "ok", "message": "Python MySQL backend is running"}


app.include_router(notebooks.router)
app.include_router(entries.router)
app.include_router(review_logs.router)
app.include_router(auth.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.db_sql.main:app", host="127.0.0.1", port=8000, reload=True)
