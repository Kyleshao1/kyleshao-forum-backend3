import express from "express";
import cors from "cors";
import authRouter from "./auth.js";
import postsRouter from "./posts.js";
import profileRouter from "./profile.js";

const app = express();
app.use(cors());
app.use(express.json());

const router = express.Router();

router.use("/auth", authRouter);
router.use("/posts", postsRouter);
router.use("/profile", profileRouter);

router.get("/", (req, res) => {
  res.json({ message: "Forum backend router working!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
export default router;
