-- Manual repair. Do not run this from deploy, seed, or the API.
-- Review the preview, then run the transaction once against production.
--
-- A sequence message belongs to subscription."creatorId". This moves any
-- chat_sequence_jobs message that landed in another creator's conversation
-- into the fan's conversation with that subscription creator, and sets the
-- sender to that creator's user. Other messages in the wrong conversation stay.

-- Preview
SELECT
  j.id AS job_id,
  s.id AS subscription_id,
  fan.email AS fan_email,
  wrong_profile.username AS stored_creator,
  right_profile.username AS subscription_creator,
  m.id AS message_id,
  left(m.body, 80) AS body
FROM chat_sequence_jobs j
JOIN subscriptions s ON s.id = j."subscriptionId"
JOIN users fan ON fan.id = s."fanId"
JOIN messages m ON m.id = j."messageId"
JOIN conversations conv ON conv.id = m."conversationId"
JOIN creators wrong_creator ON wrong_creator.id = conv."creatorId"
JOIN users wrong_user ON wrong_user.id = wrong_creator."userId"
LEFT JOIN profiles wrong_profile ON wrong_profile."userId" = wrong_user.id
JOIN creators right_creator ON right_creator.id = s."creatorId"
JOIN users right_user ON right_user.id = right_creator."userId"
LEFT JOIN profiles right_profile ON right_profile."userId" = right_user.id
WHERE conv."creatorId" IS DISTINCT FROM s."creatorId"
   OR m."senderId" IS DISTINCT FROM right_creator."userId"
ORDER BY m."createdAt";

BEGIN;

INSERT INTO conversations (id, "participantIds", "fanId", "creatorId", "createdAt", "updatedAt", "isDemo")
SELECT
  'fixseq_' || substr(md5(s."fanId" || ':' || s."creatorId"), 1, 24),
  jsonb_build_array(s."fanId", right_creator."userId"),
  s."fanId",
  s."creatorId",
  NOW(),
  NOW(),
  false
FROM chat_sequence_jobs j
JOIN subscriptions s ON s.id = j."subscriptionId"
JOIN messages m ON m.id = j."messageId"
JOIN conversations conv ON conv.id = m."conversationId"
JOIN creators right_creator ON right_creator.id = s."creatorId"
WHERE s."fanId" IS NOT NULL
  AND (conv."creatorId" IS DISTINCT FROM s."creatorId" OR m."senderId" IS DISTINCT FROM right_creator."userId")
ON CONFLICT ("fanId", "creatorId") DO NOTHING;

UPDATE messages AS m
SET
  "conversationId" = target.id,
  "senderId" = right_creator."userId"
FROM chat_sequence_jobs j
JOIN subscriptions s ON s.id = j."subscriptionId"
JOIN creators right_creator ON right_creator.id = s."creatorId"
JOIN conversations target ON target."fanId" = s."fanId" AND target."creatorId" = s."creatorId"
WHERE m.id = j."messageId"
  AND (m."conversationId" IS DISTINCT FROM target.id OR m."senderId" IS DISTINCT FROM right_creator."userId");

COMMIT;
