import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ message: "Profile route working" });
});

router.post("/init", (req, res) => {
  res.json({ message: "Profile init route working" });
});

export default router;
