import asyncio
import ssl

import backoff
import websockets


class RetryableError(Exception):
    pass


class Core(object):
    def __init__(self, args, camera, logger):
        self.host = args.host
        self.token = args.token
        self.mac = args.mac
        self.sysid = getattr(args, "sysid", None)
        self.logger = logger
        self.cam = camera

        # Set up ssl context for requests
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE
        self.ssl_context.load_cert_chain(args.cert, args.cert)

    def _build_ws_headers(self) -> dict[str, str]:
        """Build the headers sent on the Protect adoption WebSocket.

        ``camera-mac`` identifies the device by MAC. ``camera-model``
        identifies the device by sysid (e.g. ``0xa572`` for a UVC G4
        Bullet); Protect needs it to look the model up in its inventory
        during the strict adoption path. Until v1.6.3 we computed
        ``args.sysid`` but never sent it — Protect would queue back its
        own hello + paramAgreement and then close the WS with code 4012,
        because the model-validation pass had nothing to validate against.
        """
        headers = {"camera-mac": self.mac}
        if self.sysid:
            headers["camera-model"] = self.sysid
        return headers

    async def run(self) -> None:
        uri = "wss://{}:7442/camera/1.0/ws?token={}".format(self.host, self.token)
        headers = self._build_ws_headers()
        has_connected = False

        @backoff.on_predicate(
            backoff.expo,
            lambda retryable: retryable,
            factor=2,
            jitter=None,
            max_value=10,
            logger=self.logger,
        )
        async def connect():
            nonlocal has_connected
            from unifi.utils import mask_url

            self.logger.info(f"Creating ws connection to {mask_url(uri)}")
            try:
                ws = await websockets.connect(
                    uri,
                    additional_headers=headers,
                    ssl=self.ssl_context,
                    subprotocols=["secure_transfer"],
                )
                has_connected = True
            except websockets.exceptions.InvalidStatusCode as e:
                if e.status_code == 403:
                    self.logger.error(
                        "The token is invalid. Please generate a new one and try again."
                    )
                # Hitting rate-limiting
                elif e.status_code == 429:
                    return True
                raise
            except asyncio.exceptions.TimeoutError:
                self.logger.info(f"Connection to {self.host} timed out.")
                return True
            except ConnectionRefusedError:
                self.logger.info(f"Connection to {self.host} refused.")
                return True

            tasks = [
                asyncio.create_task(self.cam._run(ws)),
                asyncio.create_task(self.cam.run()),
            ]
            try:
                await asyncio.gather(*tasks)
            except RetryableError:
                for task in tasks:
                    if not task.done():
                        task.cancel()
                return True
            finally:
                await self.cam.close()
                try:
                    await ws.close()
                except Exception:
                    pass

        await connect()
