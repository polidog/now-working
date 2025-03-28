import { App } from '@slack/bolt';
import { PrismaClient } from '@prisma/client';
import UserService from '../services/UserService';
import WorkingSessionService from '../services/WorkingSessionService';
import OrganizationService from '../services/OrganizationService';

/**
 * Slackコマンドハンドラークラス
 */
export default class SlackCommandHandler {
  private app: App;
  private prisma: PrismaClient;
  private userService: UserService;
  private workingSessionService: WorkingSessionService;
  private organizationService: OrganizationService;

  constructor(app: App, prisma: PrismaClient) {
    this.app = app;
    this.prisma = prisma;
    this.userService = new UserService(prisma);
    this.workingSessionService = new WorkingSessionService(prisma);
    this.organizationService = new OrganizationService(prisma);
  }

  /**
   * コマンドハンドラーの初期化
   */
  initialize(): void {
    this.setupCheckinHandler();
    this.setupCheckoutHandler();
    this.setupStatusHandler();
    this.setupVacationHandler();
  }

  /**
   * チェックインコマンドのハンドラー設定
   */
  private setupCheckinHandler(): void {
    this.app.command('/checkin', async ({ command, ack, respond }) => {
      await ack();

      try {
        // Slack ユーザーの取得
        const user = await this.userService.findBySlackUserId(command.user_id);
        if (!user) {
          await respond({
            text: `ユーザー登録が必要です。管理者に連絡してください。`,
          });
          return;
        }

        // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
        const organizations = await this.organizationService.getUserOrganizations(user.id);
        if (organizations.length === 0) {
          await respond({
            text: `所属組織が見つかりません。管理者に連絡してください。`,
          });
          return;
        }

        // 最初の組織を使用
        const organization = organizations[0];

        // コメントがあれば取得
        const note = command.text ? command.text.trim() : undefined;

        // チェックイン実行
        await this.workingSessionService.checkin(user.id, organization.id, note);

        // Slackステータス更新（オプション）
        // this.updateSlackStatus(command.user_id, '稼働中');

        await respond({
          text: `@${command.user_name} さんがチェックインしました！${note ? `\n> ${note}` : ''}`,
        });
      } catch (error) {
        await respond({
          text: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        });
      }
    });
  }

  /**
   * チェックアウトコマンドのハンドラー設定
   */
  private setupCheckoutHandler(): void {
    this.app.command('/checkout', async ({ command, ack, respond }) => {
      await ack();

      try {
        // Slack ユーザーの取得
        const user = await this.userService.findBySlackUserId(command.user_id);
        if (!user) {
          await respond({
            text: `ユーザー登録が必要です。管理者に連絡してください。`,
          });
          return;
        }

        // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
        const organizations = await this.organizationService.getUserOrganizations(user.id);
        if (organizations.length === 0) {
          await respond({
            text: `所属組織が見つかりません。管理者に連絡してください。`,
          });
          return;
        }

        // 最初の組織を使用
        const organization = organizations[0];

        // コメントがあれば取得
        const note = command.text ? command.text.trim() : undefined;

        // チェックアウト実行
        const session = await this.workingSessionService.checkout(user.id, organization.id, note);
        
        // セッションの開始時間と終了時間から稼働時間を計算
        const hours = session.checkoutAt && 
          (session.checkoutAt.getTime() - session.checkinAt.getTime()) / (1000 * 60 * 60);
        
        // Slackステータスをリセット（オプション）
        // this.resetSlackStatus(command.user_id);

        await respond({
          text: `@${command.user_name} さんがチェックアウトしました！${note ? `\n> ${note}` : ''}` +
                 `\n稼働時間: ${hours ? hours.toFixed(2) : '計算エラー'} 時間`,
        });
      } catch (error) {
        await respond({
          text: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        });
      }
    });
  }

  /**
   * ステータス確認コマンドのハンドラー設定
   */
  private setupStatusHandler(): void {
    this.app.command('/status', async ({ command, ack, respond }) => {
      await ack();

      try {
        // Slack ユーザーの取得
        const user = await this.userService.findBySlackUserId(command.user_id);
        if (!user) {
          await respond({
            text: `ユーザー登録が必要です。管理者に連絡してください。`,
          });
          return;
        }

        // 組織の取得（TODO: 複数組織対応の場合は選択UIが必要）
        const organizations = await this.organizationService.getUserOrganizations(user.id);
        if (organizations.length === 0) {
          await respond({
            text: `所属組織が見つかりません。管理者に連絡してください。`,
          });
          return;
        }

        // 最初の組織を使用
        const organization = organizations[0];

        // 全アクティブセッションを取得
        const activeSessions = await this.workingSessionService.getAllActiveSessions(organization.id);
        
        if (activeSessions.length === 0) {
          await respond({
            text: `現在稼働中のメンバーはいません。`,
          });
          return;
        }

        // メッセージ作成
        let message = `現在稼働中のメンバー (${activeSessions.length}人):\n`;
        
        for (const session of activeSessions) {
          const startTime = session.checkinAt.toLocaleString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
          });
          
          message += `• @${session.user.name} (開始: ${startTime})${session.note ? ` - ${session.note}` : ''}\n`;
        }

        await respond({
          text: message,
        });
      } catch (error) {
        await respond({
          text: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        });
      }
    });
  }

  /**
   * 休暇申請コマンドのハンドラー設定
   */
  private setupVacationHandler(): void {
    this.app.command('/vacation', async ({ command, ack, respond }) => {
      await ack();

      // TODO: Google Calendar連携を実装
      await respond({
        text: `休暇申請機能は近日公開予定です。`,
      });
    });
  }
}
