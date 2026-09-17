import os
import httpx
from fastapi import FastAPI, Response

app = FastAPI()

BOT_TOKEN = os.getenv("BOT_TOKEN")

AVATAR_CACHE = {
    "file_id": None,
    "image_bytes": None,
}


@app.get("/api/bot-avatar")
async def get_bot_avatar():
    if not BOT_TOKEN:
        return Response(status_code=500, content="BOT_TOKEN is not set")

    async with httpx.AsyncClient() as client:
        me_res = await client.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getMe")
        bot_id = me_res.json().get("result", {}).get("id")

        chat_res = await client.get(
            f"https://api.telegram.org/bot{BOT_TOKEN}/getChat",
            params={"chat_id": bot_id},
        )
        photo = chat_res.json().get("result", {}).get("photo")

        if not photo:
            return Response(
                status_code=404, content="Bot has no profile picture"
            )

        current_file_id = photo["big_file_id"]

        # 3. Если аватарка не менялась и лежит в кэше — отдаём сразу
        if (
            AVATAR_CACHE["file_id"] == current_file_id
            and AVATAR_CACHE["image_bytes"]
        ):
            return Response(
                content=AVATAR_CACHE["image_bytes"],
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=1800"},  # Кэш браузера 30 мин
            )

        file_res = await client.get(
            f"https://api.telegram.org/bot{BOT_TOKEN}/getFile",
            params={"file_id": current_file_id},
        )
        file_path = file_res.json().get("result", {}).get("file_path")

        img_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
        img_res = await client.get(img_url)

        AVATAR_CACHE["file_id"] = current_file_id
        AVATAR_CACHE["image_bytes"] = img_res.content

        return Response(
            content=img_res.content,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=1800"},
        )
