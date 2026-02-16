from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="BPM_TAP_SYNC_",
        env_file=".env",
        extra="ignore",
    )

    # Web
    host: str = "0.0.0.0"
    port: int = 8000

    # OSC targets (defaults to localhost)
    ma3_ip: str = "127.0.0.1"
    ma3_port: int = 8001

    resolume_ip: str = "127.0.0.1"
    resolume_port: int = 7000

    heavym_ip: str = "127.0.0.1"
    heavym_port: int = 9000


settings = Settings()