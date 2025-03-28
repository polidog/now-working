import { PrismaClient, WorkingSession } from '@prisma/client';

export default class WorkingSessionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * チェックイン処理（打刻開始）
   */
  async checkin(
    userId: string,
    organizationId: string,
    note?: string
  ): Promise<WorkingSession> {
    // 未終了のセッションがあるか確認
    const activeSession = await this.getActiveSession(userId, organizationId);
    
    if (activeSession) {
      throw new Error('既にチェックインしています。先にチェックアウトしてください。');
    }

    // 新しいセッションを作成
    return this.prisma.workingSession.create({
      data: {
        userId,
        organizationId,
        checkinAt: new Date(),
        note,
      },
    });
  }

  /**
   * チェックアウト処理（打刻終了）
   */
  async checkout(
    userId: string,
    organizationId: string,
    note?: string
  ): Promise<WorkingSession> {
    // アクティブなセッションを取得
    const activeSession = await this.getActiveSession(userId, organizationId);

    if (!activeSession) {
      throw new Error('チェックインしていません。先にチェックインしてください。');
    }

    // セッションを更新して終了時間を設定
    return this.prisma.workingSession.update({
      where: { id: activeSession.id },
      data: {
        checkoutAt: new Date(),
        note: note || activeSession.note,
      },
    });
  }

  /**
   * 現在アクティブなセッションを取得
   */
  async getActiveSession(
    userId: string,
    organizationId: string
  ): Promise<WorkingSession | null> {
    return this.prisma.workingSession.findFirst({
      where: {
        userId,
        organizationId,
        checkoutAt: null,
      },
    });
  }

  /**
   * 現在アクティブなすべてのセッションを取得
   */
  async getAllActiveSessions(organizationId: string): Promise<WorkingSession[]> {
    return this.prisma.workingSession.findMany({
      where: {
        organizationId,
        checkoutAt: null,
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * 指定した期間のセッションを取得
   */
  async getSessionsByDateRange(
    userId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<WorkingSession[]> {
    return this.prisma.workingSession.findMany({
      where: {
        userId,
        organizationId,
        checkinAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        checkinAt: 'asc',
      },
    });
  }

  /**
   * 月次レポートのデータを取得
   */
  async getMonthlyReport(
    userId: string,
    organizationId: string,
    year: number,
    month: number
  ): Promise<{ 
    totalWorkingHours: number;
    sessions: WorkingSession[];
  }> {
    // 指定した月の開始日と終了日を設定
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 該当月のセッションを取得
    const sessions = await this.getSessionsByDateRange(
      userId,
      organizationId,
      startDate,
      endDate
    );

    // 総労働時間を計算
    let totalWorkingHours = 0;
    
    sessions.forEach((session) => {
      if (session.checkoutAt) {
        const duration = session.checkoutAt.getTime() - session.checkinAt.getTime();
        totalWorkingHours += duration / (1000 * 60 * 60); // ミリ秒を時間に変換
      }
    });

    return {
      totalWorkingHours,
      sessions,
    };
  }
}
