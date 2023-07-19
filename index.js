import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

const { TELEGRAM_BOT_TOKEN, SERVER_URL } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const URI = `/webhook/${TELEGRAM_BOT_TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

const init = async () => {
    const res = await axios.get(
        `${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`
    );
    console.log(res.data);
};

app.get("/", (req, res) => {
    res.send(`Telegram bot is live`);
});

async function getEpisodes(page) {
    let { data } = await axios.get(process.env.JIO_CINEMA_SERIES_WISE_EPISODE, {
        params: {
            id: 3762357,
            sort: "episode:desc",
            responseType: "common",
            devicePlatformType: "android",
            page: page,
        },
    });
    let episodeUI = data.result.map(({ id, episode, shortTitle }) => {
        return [
            {
                text: `${episode} :: ${shortTitle}`,
                callback_data: `PLAY::${id}`,
            },
        ];
    });
    return { episodeUI, totalpage: Math.ceil(data.totalAsset / 10) };
}

async function getStreamUrl(id) {
    let { data } = await axios.request({
        method: "POST",
        url: process.env.JIO_CINEMA_GUEST_TOKEN,
        data: {
            adId: "a0675bc4-ca29-48dd-8679-e0077762c7e7",
            appName: "RJIL_JioCinema",
            deviceId: "c48824b349f8f463",
            deviceType: "phone",
            freshLaunch: false,
            os: "android",
        },
    });
    let { authToken } = data;
    let streamData = await axios.request({
        method: "POST",
        url: `${process.env.JIO_CINEMA_PLAYBACK}/${id}`,
        headers: {
            accesstoken: authToken,
            referer: "https://www.jiocinema.com/",
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "x-platform": "androidweb",
            "Content-Type": "application/json",
        },
        data: {
            "4k": false,
            ageGroup: "18+",
            appVersion: "3.4.0",
            bitrateProfile: "xhdpi",
            capability: {
                drmCapability: {
                    aesSupport: "yes",
                    fairPlayDrmSupport: "yes",
                    playreadyDrmSupport: "none",
                    widevineDRMSupport: "yes",
                },
                frameRateCapability: [
                    { frameRateSupport: "30fps", videoQuality: "1440p" },
                ],
            },
            continueWatchingRequired: true,
            dolby: false,
            downloadRequest: false,
            hevc: false,
            kidsSafe: false,
            manufacturer: "Windows",
            model: "Windows",
            multiAudioRequired: true,
            osVersion: "10",
            parentalPinValid: true,
        },
    });
    let { playbackUrls } = streamData.data.data;
    const { url, licenseurl } = playbackUrls[0];
    playbackUrls = `https://bitmovin.com/demos/stream-test?format=dash&manifest=${encodeURIComponent(
        url
    )}&drm=widevine&license=${encodeURIComponent(licenseurl)}`;
    return { url, licenseurl, playbackUrls };
}

app.get("/getEpisodes", async (req, res) => {
    const response = await getStreamUrl(3499624);
    res.send(response);
});

app.post(URI, async (req, res) => {
    let responseText = "",
        data;
    let page = 1;
    let { message, callback_query } = req.body;
    if (callback_query) {
        message = callback_query.message;
        data = callback_query.data;
    }
    if (data && data.split("::")[0] === "PAGE")
        page = parseInt(data.split("::")[1]);
    let { chat, text } = message;
    let chatId = chat?.id;

    if (text === "/start" || (data && data.split("::")[0] === "PAGE")) {
        responseText = `Welcome ${chat?.first_name} ${chat?.last_name}`;
        const { episodeUI, totalpage } = await getEpisodes(page);
        const pageArr = [];
        if (page - 1 > 0) {
            pageArr.push({
                text: `Previous`,
                callback_data: `PAGE::${page - 1}`,
            });
        }
        if (page + 1 <= totalpage) {
            pageArr.push({
                text: `Next`,
                callback_data: `PAGE::${page + 1}`,
            });
        }
        if (pageArr.length > 0) episodeUI.push(pageArr);

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: responseText,
            reply_markup: {
                inline_keyboard: episodeUI,
            },
        });
    }

    if (data && data.split("::")[0] === "PLAY") {
        try {
            const { playbackUrls } = await getStreamUrl(
                parseInt(data.split("::")[1])
            );
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: playbackUrls,
            });
        } catch (error) {
            const errorMsg = `[Error] ${error.response.data.message}`;
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: "Try after few seconds" + errorMsg,
            });
        }
    }
    // Define the menu options
    return res.send();
});

app.listen(process.env.PORT || 5000, async () => {
    console.log("🚀 app running on port", process.env.PORT || 5000);
    await init();
});
