"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProfile } from "@/lib/repo/profile";
import {
  appendCallTurn as repoAppendTurn,
  completeCall as repoCompleteCall,
  createCall as repoCreateCall,
  createCustomer,
  getCall,
  getCallReview,
  getCustomer,
  listCustomers,
  listCompletedCalls,
  listActiveCalls,
  saveCallReview,
} from "@/lib/repo/call";
import { callCustomerReply } from "@/lib/llm/call-reply";
import { generateCallScript } from "@/lib/llm/call-script";
import { reviewCall } from "@/lib/llm/call-review";
import type { CallPurpose, CallReviewResult, CallTurn, Customer, OurSideInfo } from "@/lib/repo/types";

/**
 * 模拟电话 server actions。多用户：userId 取自当前 session。
 */

export async function listCustomersAction(): Promise<Customer[]> {
  const uid = (await auth())?.user?.id;
  return listCustomers(uid);
}

export interface CreateCallInput {
  customerId?: string | null;
  newCustomer?: Omit<Customer, "id" | "userId" | "createdAt" | "updatedAt"> | null;
  purpose: CallPurpose;
  purposeOther?: string | null;
  ourSide: OurSideInfo;
}

/** 新建一通电话：建档（如需）→ 生成脚本骨架 → 创建通话 → 返回 id（客户端跳转） */
export async function createCall(input: CreateCallInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const uid = (await auth())?.user?.id;
  if (!uid) return { ok: false, error: "未登录" };

  let customer: Customer | null = null;
  if (input.customerId) {
    customer = await getCustomer(input.customerId, uid);
  } else if (input.newCustomer) {
    customer = await createCustomer(input.newCustomer, uid);
  }
  if (!customer) return { ok: false, error: "客户信息缺失，请填写或选择客户" };

  const profile = await getProfile(uid);
  const locale = profile?.locale ?? "zh-CN";

  const script = await generateCallScript({
    customer,
    purpose: input.purpose,
    purposeOther: input.purposeOther,
    ourSide: input.ourSide,
    userId: uid,
    locale,
  });

  const call = await repoCreateCall({
    userId: uid,
    customerId: customer.id,
    customerSnapshot: customer,
    purpose: input.purpose,
    purposeOther: input.purposeOther ?? null,
    ourSide: input.ourSide,
    scriptSkeleton: script.ok ? script.data ?? null : null,
  });

  return { ok: true, id: call.id };
}

/** 用户发言 → AI 客户回复（一进一出） */
export async function callSendMessage(
  callId: string,
  content: string,
): Promise<{ ok: boolean; userTurn?: CallTurn; aiTurn?: CallTurn; error?: string }> {
  const text = content.trim();
  if (!text) return { ok: false, error: "消息不能为空" };

  const uid = (await auth())?.user?.id;
  const call = await getCall(callId, uid);
  if (!call) return { ok: false, error: "通话不存在" };
  if (call.status !== "active") return { ok: false, error: "通话已结束" };

  const userTurn: CallTurn = {
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };
  await repoAppendTurn(callId, userTurn, uid);

  const updated = (await getCall(callId, uid))!;
  const reply = await callCustomerReply({
    customer: updated.customerSnapshot,
    purpose: updated.purpose,
    purposeOther: updated.purposeOther,
    ourSide: updated.ourSide,
    turns: updated.turns,
    latestUserMessage: text,
    userId: uid,
    sessionId: callId,
    locale: (await getProfile(uid))?.locale ?? "zh-CN",
  });

  if (!reply.ok || !reply.reply) {
    return { ok: false, error: reply.error ?? "AI 客户回复失败，请重试" };
  }

  const aiTurn: CallTurn = {
    role: "ai_customer",
    content: reply.reply,
    createdAt: new Date().toISOString(),
  };
  await repoAppendTurn(callId, aiTurn, uid);

  return { ok: true, userTurn, aiTurn };
}

/** 结束通话并复盘：评分 → 落库 → 跳转复盘页 */
export async function finishCall(callId: string) {
  const uid = (await auth())?.user?.id;
  const call = await getCall(callId, uid);
  if (!call) throw new Error("通话不存在");

  const transcript = call.turns
    .map((t) => `${t.role === "user" ? "【销售】" : "【客户】"}: ${t.content}`)
    .join("\n");
  await repoCompleteCall(callId, transcript, uid);

  const review = await reviewCall({
    customer: call.customerSnapshot,
    purpose: call.purpose,
    purposeOther: call.purposeOther,
    ourSide: call.ourSide,
    turns: call.turns,
    userId: uid,
    callId,
    locale: (await getProfile(uid))?.locale ?? "zh-CN",
  });

  if (review.ok && review.data && !review.degraded) {
    await saveCallReview(callId, uid!, review.data);
  }

  redirect(`/calls/${callId}/review`);
}

/** 复盘页重跑复盘（首次失败时用） */
export async function retryCallReview(callId: string): Promise<{ ok: boolean; error?: string }> {
  const uid = (await auth())?.user?.id;
  const call = await getCall(callId, uid);
  if (!call) return { ok: false, error: "通话不存在" };
  const review = await reviewCall({
    customer: call.customerSnapshot,
    purpose: call.purpose,
    purposeOther: call.purposeOther,
    ourSide: call.ourSide,
    turns: call.turns,
    userId: uid,
    callId,
    locale: (await getProfile(uid))?.locale ?? "zh-CN",
  });
  if (!review.ok || !review.data) return { ok: false, error: "复盘失败，请重试" };
  if (review.degraded) return { ok: false, error: "AI 暂时繁忙，复盘未生成，请稍后再试" };
  await saveCallReview(callId, uid!, review.data);
  return { ok: true };
}

/** 读取最近一次复盘结果 */
export async function getLatestCallReview(callId: string): Promise<CallReviewResult | null> {
  const uid = (await auth())?.user?.id;
  return getCallReview(callId, uid);
}

/** 列表用：供首页/列表页取进行中与已结束通话数量（避免重复 import） */
export async function getCallLists(userId?: string) {
  const uid = userId ?? (await auth())?.user?.id;
  const active = await listActiveCalls(uid);
  const completed = await listCompletedCalls(uid);
  return { active, completed };
}
