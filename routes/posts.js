import express from "express";
const router = express.Router();

// 发帖列表
router.get("/", (req, res) => {
  res.json({ message: "Posts route working" });
});

// 新建帖子
router.post("/new", (req, res) => {
  res.json({ message: "New post route working" });
});

export default router;
