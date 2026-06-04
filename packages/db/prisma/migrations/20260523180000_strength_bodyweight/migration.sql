-- 自重动作：最大次数 + 附加/辅助负荷（负=辅助，正=负重）
ALTER TABLE "StrengthLevel" ADD COLUMN "maxReps" INTEGER;
ALTER TABLE "StrengthLevel" ADD COLUMN "loadAdjustmentKg" DOUBLE PRECISION;
