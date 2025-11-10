import express from "express";
import authRouter from "./auth.js";
import postsRouter from "./posts.js";
import profileRouter from "./profile.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/posts", postsRouter);
router.use("/profile", profileRouter);

router.get("/", (req, res) => {
  res.json({ message: "Forum backend router working!" });
});

export default router;
