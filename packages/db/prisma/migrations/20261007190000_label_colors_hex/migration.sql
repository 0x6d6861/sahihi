-- Label colours become free hex (ADR 0025 amendment). The nine named colours map to the picker's
-- preset swatches (LABEL_COLOR_PRESETS in @sahihi/core), so existing labels keep their colour.
ALTER TABLE "Document" ALTER COLUMN "color" TYPE TEXT USING (
  CASE "color"::text
    WHEN 'RED' THEN '#D73337'
    WHEN 'ORANGE' THEN '#D35F00'
    WHEN 'YELLOW' THEN '#C28F00'
    WHEN 'GREEN' THEN '#158F44'
    WHEN 'TEAL' THEN '#008B86'
    WHEN 'BLUE' THEN '#1570D1'
    WHEN 'PURPLE' THEN '#854ECE'
    WHEN 'PINK' THEN '#CD4290'
    WHEN 'GRAY' THEN '#7A7A7A'
  END
);

ALTER TABLE "Folder" ALTER COLUMN "color" TYPE TEXT USING (
  CASE "color"::text
    WHEN 'RED' THEN '#D73337'
    WHEN 'ORANGE' THEN '#D35F00'
    WHEN 'YELLOW' THEN '#C28F00'
    WHEN 'GREEN' THEN '#158F44'
    WHEN 'TEAL' THEN '#008B86'
    WHEN 'BLUE' THEN '#1570D1'
    WHEN 'PURPLE' THEN '#854ECE'
    WHEN 'PINK' THEN '#CD4290'
    WHEN 'GRAY' THEN '#7A7A7A'
  END
);

-- DropEnum
DROP TYPE "ItemColor";
