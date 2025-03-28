import { PrismaClient, User, Membership, Role, MembershipStatus } from '@prisma/client';

export default class UserService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * ユーザーを作成する
   */
  async createUser(
    name: string,
    email: string,
    slackUserId?: string,
    chatworkUserId?: string
  ): Promise<User> {
    return this.prisma.user.create({
      data: {
        name,
        email,
        slackUserId,
        chatworkUserId,
      },
    });
  }

  /**
   * Slack User IDからユーザーを検索する
   */
  async findBySlackUserId(slackUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { slackUserId },
    });
  }

  /**
   * Chatwork User IDからユーザーを検索する
   */
  async findByChatworkUserId(chatworkUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { chatworkUserId },
    });
  }

  /**
   * メールアドレスからユーザーを検索する
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * ユーザーを組織に招待する
   */
  async inviteUserToOrganization(
    userId: string,
    organizationId: string,
    role: Role = Role.MEMBER
  ): Promise<Membership> {
    return this.prisma.membership.create({
      data: {
        userId,
        organizationId,
        role,
        status: MembershipStatus.INVITED,
      },
    });
  }

  /**
   * 招待を承認する
   */
  async acceptInvitation(membershipId: string): Promise<Membership> {
    return this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: MembershipStatus.ACTIVE },
    });
  }

  /**
   * ユーザーのメンバーシップを取得する
   */
  async getUserMemberships(userId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: { 
        userId,
        status: MembershipStatus.ACTIVE
      },
      include: {
        organization: true,
      },
    });
  }

  /**
   * ユーザーが組織に所属しているか確認する
   */
  async isUserMemberOfOrganization(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    return membership !== null && membership.status === MembershipStatus.ACTIVE;
  }
}
