/**
 * DemandIntakeController —— /api/intake HTTP 层（I01，2026-11-10 设计稿 §4）。
 *
 * 信封规范合规（CLAUDE.md 契约）：列表 {data, pagination}、单实体 {data}、
 * 写操作 {success:true,...}、错误 {error, message}。IntakeError 的
 * statusCode/code 直映射（duplicate_source_ref 409 带 existing_id）。
 *
 * 业务在 IntakeService / IntakeConversionService；控制器只管 HTTP 关注点。
 * 服务实例按 this.db 惰性构造（集成测试可覆写 controller.db）。
 */
import type { Response } from 'express';
import { BaseController, RequestWithContext } from './BaseController.js';
import { IntakeService, IntakeError } from '../../services/intake/IntakeService.js';
import { IntakeConversionService } from '../../services/intake/IntakeConversionService.js';
import type { IntakeCaptureInput, IntakeConvertInput } from '../../../../shared/types/intake.js';

type RequestWithLogging = RequestWithContext;

export class DemandIntakeController extends BaseController {
  constructor() {
    super({ enableLogging: true });
  }

  private intake(): IntakeService {
    return new IntakeService(this.db);
  }

  private conversion(): IntakeConversionService {
    return new IntakeConversionService(this.db);
  }

  /** IntakeError → 契约错误信封；其余走 500 */
  private sendIntakeError(req: RequestWithLogging, res: Response, error: unknown): void {
    if (error instanceof IntakeError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        ...(error.existingId !== undefined ? { existing_id: error.existingId } : {}),
        requestId: req.requestId,
      });
      return;
    }
    this.handleError(error as any, req, res, 'Intake operation failed');
  }

  create = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const { intake, warnings } = await this.intake().capture(
        req.body as IntakeCaptureInput,
        (req as any).user?.id ?? null
      );
      // I01v/D16+F4：审计 action 对齐设计稿 §4.4（INTAKE_*）+ 必须 await——
      // logAuditEvent 内部 catch 后 rethrow，浮动 Promise 失败即
      // UnhandledRejection（dev/test exit(1)，EXP-B08 探针红证）
      await (req as any).logAuditEvent?.('demand_intake', intake.id, 'INTAKE_CREATE', undefined, intake);
      // 信封：写操作 success + data；warnings 是标题重复的非阻塞提示（§4.1）
      res.json({ success: true, data: intake, warnings, requestId: req.requestId });
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  createBatch = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const { created, skipped } = await this.intake().captureBatch(
        (req.body?.items ?? []) as IntakeCaptureInput[],
        (req as any).user?.id ?? null
      );
      for (const row of created) {
        await (req as any).logAuditEvent?.('demand_intake', row.id, 'INTAKE_CREATE', undefined, row);
      }
      this.sendSuccess(req, res, { created, skipped });
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  getAll = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const { rows, total, page, limit } = await this.intake().list({
        status: req.query.status as string | undefined,
        source_channel: req.query.source_channel as string | undefined,
        q: req.query.q as string | undefined,
        page: Number(req.query.page) || undefined,
        limit: Number(req.query.limit) || undefined,
        sort: req.query.sort === 'newest' ? 'newest' : 'oldest',
      });
      this.sendPaginatedResponse(req, res, rows, total, page, limit);
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  /** 路由必须注册在 /:id 之前（express 按注册顺序匹配） */
  counts = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      this.sendSuccess(req, res, await this.intake().counts());
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  getById = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      this.sendSuccess(req, res, await this.intake().get(req.params.id));
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  update = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const before = await this.intake().get(req.params.id);
      const after = await this.intake().update(req.params.id, req.body ?? {});
      await (req as any).logAuditEvent?.('demand_intake', after.id, 'INTAKE_UPDATE', before, after);
      this.sendSuccess(req, res, after);
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  convert = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const result = await this.conversion().convert(
        req.params.id,
        (req.body ?? {}) as IntakeConvertInput,
        (req as any).user?.id ?? null
      );
      // R5（评审裁决）：convert 事务已提交（项目已建、intake 已 converted），
      // 此处审计失败将返回 500——恢复路径=重试→409 existing_project_id→跳转
      // 项目；不吞审计错误（Never bypass audit logging），审计入事务超批
      await (req as any).logAuditEvent?.('demand_intake', req.params.id, 'INTAKE_CONVERT', undefined, result.intake);
      // projects 表事件保持基础 action（设计稿 §4.3:264「intake CONVERT + project CREATE」）
      await (req as any).logAuditEvent?.('projects', String(result.project.id), 'CREATE', undefined, result.project);
      this.sendSuccess(req, res, result, 'Intake converted');
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  reject = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const intake = await this.intake().reject(req.params.id, req.body?.reason);
      await (req as any).logAuditEvent?.('demand_intake', intake.id, 'INTAKE_REJECT', undefined, intake);
      this.sendSuccess(req, res, intake);
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  /** D19①：拒绝可逆——rejected → new（审计 INTAKE_REOPEN，留痕完整） */
  reopen = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const intake = await this.intake().reopen(req.params.id);
      await (req as any).logAuditEvent?.('demand_intake', intake.id, 'INTAKE_REOPEN', undefined, intake);
      this.sendSuccess(req, res, intake);
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });

  remove = this.asyncHandler(async (req: RequestWithLogging, res: Response) => {
    try {
      const before = await this.intake().get(req.params.id);
      await this.intake().remove(req.params.id);
      await (req as any).logAuditEvent?.('demand_intake', req.params.id, 'INTAKE_DELETE', before, undefined);
      res.json({ success: true, requestId: req.requestId });
    } catch (error) {
      this.sendIntakeError(req, res, error);
    }
  });
}
