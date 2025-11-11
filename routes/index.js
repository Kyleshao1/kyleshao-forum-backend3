import express from "express";
import cors from "cors";
import router from "./index.js";

const app = express();
app.use(cors());
app.use(express.json());

// 把所有以 /api 开头的请求交给 router
app.use("/api", router);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
