import dotenv from 'dotenv';
import express from 'express';
import { App } from '@slack/bolt';
import { PrismaClient } from '@prisma/client';

// 環境変数を読み込む
dotenv.config();

// データベース接続
const prisma = new PrismaClient();

// Expressアプリの初期化
const app = express();
const port = process.env.PORT || 3000;

// Slackアプリの初期化
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: process.env.SLACK_APP_TOKEN ? true : false,
  appToken: process.env.SLACK_APP_TOKEN,
});

// JSONリクエストのパース
app.use(express.json());

// ルートエンドポイント
app.get('/', (req, res) => {
  res.send('NowWorking API is running!');
});

// Slackコマンドの設定
// チェックイン
slackApp.command('/checkin', async ({ command, ack, respond }) => {
  await ack();
  
  // TODO: ユーザー認証と打刻処理
  
  await respond({
    text: `@${command.user_name} さんがチェックインしました！`,
  });
});

// チェックアウト
slackApp.command('/checkout', async ({ command, ack, respond }) => {
  await ack();
  
  // TODO: ユーザー認証と打刻終了処理
  
  await respond({
    text: `@${command.user_name} さんがチェックアウトしました！`,
  });
});

// ステータス確認
slackApp.command('/status', async ({ ack, respond }) => {
  await ack();
  
  // TODO: 現在稼働中のメンバー一覧取得
  
  await respond({
    text: "現在稼働中のメンバー一覧:\n（実装中）",
  });
});

// 休暇申請
slackApp.command('/vacation', async ({ command, ack, respond }) => {
  await ack();
  
  // TODO: 休暇申請処理とGoogleカレンダー連携
  
  await respond({
    text: `@${command.user_name} さんの休暇申請を受け付けました！`,
  });
});

// Slackアプリの起動
(async () => {
  await slackApp.start();
  console.log('⚡️ Slack Bolt app is running!');
})();

// Expressサーバーの起動
app.listen(port, () => {
  console.log(`🚀 NowWorking API server is running on port ${port}`);
});

// アプリケーション終了時の処理
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
