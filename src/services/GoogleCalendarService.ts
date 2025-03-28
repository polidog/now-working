import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Googleカレンダー連携サービス
 */
export default class GoogleCalendarService {
  private oauth2Client: OAuth2Client;
  private calendar: calendar_v3.Calendar;

  constructor() {
    // OAuth2クライアントの初期化
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // カレンダーAPIの初期化
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * OAuth2認証用のURLを生成
   */
  getAuthUrl(): string {
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  /**
   * 認証コードからトークンを取得
   */
  async getToken(code: string): Promise<any> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  /**
   * トークンをセット
   */
  setToken(tokens: any): void {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * カレンダーの一覧を取得
   */
  async listCalendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      console.error('カレンダー一覧取得エラー:', error);
      throw error;
    }
  }

  /**
   * 休暇イベントの作成
   */
  async createVacationEvent(
    calendarId: string,
    summary: string,
    description: string,
    startDate: Date,
    endDate: Date,
    userEmail?: string
  ): Promise<calendar_v3.Schema$Event> {
    try {
      // イベントの作成
      const event: calendar_v3.Schema$Event = {
        summary,
        description,
        start: {
          date: this.formatDate(startDate),
          timeZone: 'Asia/Tokyo',
        },
        end: {
          date: this.formatDate(endDate),
          timeZone: 'Asia/Tokyo',
        },
        transparency: 'transparent', // 外部向けに予定なしとして表示
      };

      // 参加者の追加（ユーザーメールアドレスがある場合）
      if (userEmail) {
        event.attendees = [
          { email: userEmail },
        ];
      }

      const response = await this.calendar.events.insert({
        calendarId,
        requestBody: event,
        sendUpdates: 'all', // 参加者に通知
      });

      return response.data;
    } catch (error) {
      console.error('カレンダーイベント作成エラー:', error);
      throw error;
    }
  }

  /**
   * 日付をYYYY-MM-DD形式にフォーマット
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * 休暇イベントの更新
   */
  async updateVacationEvent(
    calendarId: string,
    eventId: string,
    summary?: string,
    description?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<calendar_v3.Schema$Event> {
    try {
      // 更新内容の準備
      const eventPatch: calendar_v3.Schema$Event = {};
      
      if (summary) eventPatch.summary = summary;
      if (description) eventPatch.description = description;
      
      if (startDate) {
        eventPatch.start = {
          date: this.formatDate(startDate),
          timeZone: 'Asia/Tokyo',
        };
      }
      
      if (endDate) {
        eventPatch.end = {
          date: this.formatDate(endDate),
          timeZone: 'Asia/Tokyo',
        };
      }

      // イベント更新
      const response = await this.calendar.events.patch({
        calendarId,
        eventId,
        requestBody: eventPatch,
        sendUpdates: 'all', // 更新を通知
      });

      return response.data;
    } catch (error) {
      console.error('カレンダーイベント更新エラー:', error);
      throw error;
    }
  }

  /**
   * 休暇イベントの削除
   */
  async deleteVacationEvent(
    calendarId: string,
    eventId: string
  ): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: 'all', // 削除を通知
      });
    } catch (error) {
      console.error('カレンダーイベント削除エラー:', error);
      throw error;
    }
  }

  /**
   * 指定した期間のイベントを取得
   */
  async getEvents(
    calendarId: string,
    startDate: Date,
    endDate: Date
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('カレンダーイベント取得エラー:', error);
      throw error;
    }
  }
}
