import json
from channels.generic.websocket import AsyncWebsocketConsumer


class RadioConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("radio", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("radio", self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        await self.channel_layer.group_send(
            "radio",
            {"type": "radio_message", "message": data}
        )

    async def radio_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))
