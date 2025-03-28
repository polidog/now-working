import { PrismaClient, Organization, Membership, Role } from '@prisma/client';

export default class OrganizationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 組織を作成する
   */
  async createOrganization(
    name: string,
    slug: string,
    creatorUserId: string
  ): Promise<Organization> {
    // トランザクションを使用して組織の作成とオーナー権限の設定を行う
    return this.prisma.$transaction(async (tx) => {
      // 組織を作成
      const organization = await tx.organization.create({
        data: {
          name,
          slug,
        },
      });

      // 作成者をオーナーとして登録
      await tx.membership.create({
        data: {
          userId: creatorUserId,
          organizationId: organization.id,
          role: Role.OWNER,
        },
      });

      return organization;
    });
  }

  /**
   * スラッグから組織を検索する
   */
  async findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({
      where: { slug },
    });
  }

  /**
   * IDから組織を検索する
   */
  async findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({
      where: { id },
    });
  }

  /**
   * 組織を更新する
   */
  async updateOrganization(
    id: string,
    data: { name?: string; slug?: string }
  ): Promise<Organization> {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  /**
   * 組織のメンバー一覧を取得する
   */
  async getOrganizationMembers(organizationId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: { 
        organizationId,
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * 組織のアクティブメンバー一覧を取得する
   */
  async getActiveOrganizationMembers(organizationId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: { 
        organizationId,
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
    });
  }

  /**
   * ユーザーの組織内のロールを変更する
   */
  async changeUserRole(
    organizationId: string,
    userId: string,
    newRole: Role
  ): Promise<Membership> {
    return this.prisma.membership.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: {
        role: newRole,
      },
    });
  }

  /**
   * ユーザーのメンバーシップを削除する（退会処理）
   */
  async removeUserFromOrganization(
    organizationId: string,
    userId: string
  ): Promise<void> {
    await this.prisma.membership.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: {
        status: 'LEFT',
      },
    });
  }

  /**
   * ユーザーが所属する組織一覧を取得する
   */
  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        organization: true,
      },
    });

    return memberships.map(membership => membership.organization);
  }
}
