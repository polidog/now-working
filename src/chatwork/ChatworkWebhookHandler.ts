import { Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import UserService from '../services/UserService';
import WorkingSessionService from '../services/WorkingSessionService';
import OrganizationService from '../services/OrganizationService';

/**
 * Chatwork Webhookハンドラークラス
 */
export default class ChatworkWebhookHandler {
  private prisma: PrismaClient;
  private userService: UserService;
  private workingSessionService: WorkingSessionService;
  private organizationService: OrganizationService;
  private apiToken: string;
  private webhookToken: string;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.userService = new UserService(prisma);
    this.workingSessionService = new WorkingSessionService(prisma);
    this.organizationService = new OrganizationService(prisma);
    
    // 環境変数からトークンを取得
    this.apiToken = process.env.CHATWORK_API_TOKEN || '';
    this.webhookToken = process.env.CHATWORK_WEBHOOK_TOKEN || '';
    
    if (!this.apiToken || !this.webhookToken) {
      console.warn('Chatwork API tokenまたはWebhook tokenが設定されていません');
    }
  }

  /**
   * Webhookハンドラー
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Webhookトークンの検証
      const token = req.headers['x-chatworkwebhooktokenauth'];
      if (token !== this.webhookToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const payload = req.body;
      const { webhook_event_type, webhook_event } = payload;

      // メッセージイベントのみ処理
      if (webhook_event_type !== 'message_created') {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      const { room_id, message_id, account, body } = webhook_event;

      // コマンド解析
      const command = this.parseCommand(body);
      if (!command) {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      // コマンド処理
      let response = '';
      switch (command.name) {
        case 'checkin':
          response = await this.handleCheckinCommand(account.account_id, command.param);
          break;
        case 'checkout':
          response = await this.handleCheckoutCommand(account.account_id, command.param);
          break;
        case 'status':
          response = await this.handleStatusCommand(account.account_id);
          break;
        case 'vacation':
          response = await this.handleVacationCommand(account.account_id, command.param);
          break;
      }

      // レスポンス送信
      if (response) {
        await this.sendChatworkMessage(room_id, response);
      }

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Chatworkウェブフック処理エラー:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * コマンド解析
   */
  private parseCommand(body: string): { name: string; param?: string } | null {
    const commands = [
      { name: 'checkin', regex: /^\/checkin\s*(.*)?$/ },
      { name: 'checkout', regex: /^\/checkout\s*(.*)?$/ },
      { name: 'status', regex: /^\/status$/ },
      { name: 'vacation', regex: /^\/vacation\s*(.*)?$/ },
    ];

    for (const cmd of commands) {
      const match = body.match(cmd.regex);
      if (match) {
        return {
          name: cmd.name,
          param: match[1]?.trim(),
        };
      }
    }

    return null;
  }

  /**
   * チェックインコマンド処理
   */
  private async handleCheckinCommand(chatworkUserId: string, note?: string): Promise<string> {
    try {
      // Chatwork ユーザーの取得
      const user = await this.userService.findByChatworkUserId(chatworkUserId);
      if (!user) {
        return 'ユーザー登録が必要です。管理者に連絡してください。';
      }

      // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
      const organizations = await this.organizationService.getUserOrganizations(user.id);
      if (organizations.length === 0) {
        return '所属組織が見つかりません。管理者に連絡してください。';
      }

      // 最初の組織を使用
      const organization = organizations[0];

      // チェックイン実行
      await this.workingSessionService.checkin(user.id, organization.id, note);

      return `${user.name} さんがチェックインしました！${note ? `\n> ${note}` : ''}`;
    } catch (error) {
      return `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`;
    }
  }

  /**
   * チェックアウトコマンド処理
   */
  private async handleCheckoutCommand(chatworkUserId: string, note?: string): Promise<string> {
    try {
      // Chatwork ユーザーの取得
      const user = await this.userService.findByChatworkUserId(chatworkUserId);
      if (!user) {
        return 'ユーザー登録が必要です。管理者に連絡してください。';
      }

      // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
      const organizations = await this.organizationService.getUserOrganizations(user.id);
      if (organizations.length === 0) {
        return '所属組織が見つかりません。管理者に連絡してください。';
      }

      // 最初の組織を使用
      const organization = organizations[0];

      // チェックアウト実行
      const session = await this.workingSessionService.checkout(user.id, organization.id, note);
      
      // セッションの開始時間と終了時間から稼働時間を計算
      const hours = session.checkoutAt && 
        (session.checkoutAt.getTime() - session.checkinAt.getTime()) / (1000 * 60 * 60);
      
      return `${user.name} さんがチェックアウトしました！${note ? `\n> ${note}` : ''}` +
             `\n稼働時間: ${hours ? hours.toFixed(2) : '計算エラー'} 時間`;
    } catch (error) {
      return `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`;
    }
  }

  /**
   * ステータス確認コマンド処理
   */
  private async handleStatusCommand(chatworkUserId: string): Promise<string> {
    try {
      // Chatwork ユーザーの取得
      const user = await this.userService.findByChatworkUserId(chatworkUserId);
      if (!user) {
        return 'ユーザー登録が必要です。管理者に連絡してください。';
      }

      // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
      const organizations = await this.organizationService.getUserOrganizations(user.id);
      if (organizations.length === 0) {
        return '所属組織が見つかりません。管理者に連絡してください。';
      }

      // 最初の組織を使用
      const organization = organizations[0];

      // 全アクティブセッションを取得
      const activeSessions = await this.workingSessionService.getAllActiveSessions(organization.id);
      
      if (activeSessions.length === 0) {
        return '現在稼働中のメンバーはいません。';
      }

      // メッセージ作成
      let message = `現在稼働中のメンバー (${activeSessions.length}人):\n`;
      
      for (const session of activeSessions) {
        const startTime = session.checkinAt.toLocaleString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
        });
        
        message += `• ${session.user.name} (開始: ${startTime})${session.note ? ` - ${session.note}` : ''}\n`;
      }

      return message;
    } catch (error) {
      return `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`;
    }
  }

  /**
   * 休暇申請コマンド処理
   */
  private async handleVacationCommand(chatworkUserId: string, params?: string): Promise<string> {
    // TODO: Google Calendar連携を実装
    return '休暇申請機能は近日公開予定です。';
  }

  /**
   * Chatworkメッセージ送信
   */
  private async sendChatworkMessage(roomId: string, message: string): Promise<void> {
    try {
      const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;
      await axios.post(
        url,
        { body: message },
        {
          headers: {
            'X-ChatWorkToken': this.apiToken,
          },
        }
      );
    } catch (error) {
      console.error('Chatworkメッセージ送信エラー:', error);
    }
  }
}
