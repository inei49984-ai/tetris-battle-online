# TETRIS BATTLE ONLINE

リアルタイム1v1オンライン対戦テトリスサイト（Render 無料プラン + GitHub 連携対応）。

## 主な機能
- **クイックマッチ (1v1)**: ボタンひとつでランダム対戦マッチング
- **フレンド対戦 (合言葉ルーム)**: 4桁のルームID・招待リンクで友達と対戦（1本勝負 / 2本先取 / 3本先取、開始レベル、おじゃま倍率設定可能）
- **CPU対戦 & ソロ練習**: サーバー起動待ちや1人のときも遊べるAI対戦（Easy / Normal / Hard）
- **競技テトリス仕様**:
  - 両プレイヤー共通シードの **7-Bag** ランダム生成
  - **SRS (Super Rotation System)** 壁蹴り・T-Spin / T-Spin Mini 判定
  - **Hold / 5 Next / Ghost / Lock Delay**
  - **おじゃまブロック相殺 & REN (コンボ) / Back-to-Back / Perfect Clear**
  - **DAS / ARR / ソフトドロップ速度**のカスタム設定、スマホ用タッチ操作ボタン、エモートスタンプ、Web Audio効果音

## ローカル実行
```bash
npm install
npm start
# http://localhost:3000 を開く
```

## テスト
```bash
npm test
```

## Render (無料プラン) へのデプロイ手順
リポジトリには `render.yaml` (Render Blueprint) が含まれています。
1. Render ダッシュボードで **New +** → **Blueprint**（または **Web Service**）を選択
2. この GitHub リポジトリを接続
3. `plan: free` / `Build Command: npm install` / `Start Command: npm start` のまま **Apply / Create Web Service** をクリック
4. デプロイ完了後に発行された URL を開けばすぐにオンライン対戦ができます。
