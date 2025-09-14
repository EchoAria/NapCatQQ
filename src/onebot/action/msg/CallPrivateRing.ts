import { ContextMode, ReturnDataType, SendMsgBase } from './SendMsg';
import { ActionName, BaseCheckResult } from '@/onebot/action/router';

// 定义通话请求的参数类型（仅需要目标用户ID）
interface CallPrivateRingPayload {
  user_id: number | string;
}

class CallPrivateRing extends SendMsgBase {
  // 定义动作名称（需在ActionName中提前声明）
  override actionName = ActionName.CallPrivateRing;

  // 参数校验逻辑
  protected override async check(payload: CallPrivateRingPayload): Promise<BaseCheckResult> {
    // 验证用户ID是否存在
    if (!payload.user_id) {
      return { success: false, error: '缺少必填参数：user_id（目标用户QQ号）' };
    }
    // 验证用户ID格式（仅允许数字或数字字符串）
    if (typeof payload.user_id === 'string' && !/^\d+$/.test(payload.user_id)) {
      return { success: false, error: 'user_id必须为数字或数字字符串' };
    }
    return { success: true };
  }

  // 核心处理逻辑
  override async _handle(payload: CallPrivateRingPayload): Promise<ReturnDataType> {
    try {
      // 1. 转换用户ID为数字格式（统一处理string/number类型的输入）
      const userId = typeof payload.user_id === 'string' 
        ? parseInt(payload.user_id, 10) 
        : payload.user_id;

      // 2. 将用户QQ号转换为协议层需要的UID（调用底层用户API）
      const peerUid = await this.core.apis.UserApi.getUidByUin(userId.toString());
      if (!peerUid) {
        return { retcode: 100, status: 'failed', error: '目标用户不存在或无法获取信息' };
      }

      // 3. 构造通话请求参数（私聊场景）
      const callParams = {
        chatType: ContextMode.Private, // 私聊模式
        peerUid: peerUid,              // 目标用户的UID
        guildId: ''                    // 私聊无需群ID
      };

      // 4. 调用底层服务发起语音通话请求
      const callResult = await this.core.session.getCallService().startVoiceCall(callParams);
      if (callResult.result !== 0) {
        return { 
          retcode: callResult.result, 
          status: 'failed', 
          error: `通话请求失败，错误码：${callResult.result}` 
        };
      }

      // 5. 延迟5秒自动终止通话（实现“仅振铃”效果）
      setTimeout(async () => {
        try {
          await this.core.session.getCallService().stopVoiceCall(callResult.callId);
        } catch (stopError) {
          console.warn(`终止通话失败（callId: ${callResult.callId}）:`, stopError);
        }
      }, 5000);

      // 6. 返回成功结果（包含通话ID）
      return {
        retcode: 0,
        status: 'ok',
        data: { 
          call_id: callResult.callId,
          message: '通话请求已发送，将在5秒后自动终止'
        }
      };
    } catch (error) {
      console.error('拨打QQ电话振铃失败:', error);
      return { 
        retcode: 500, 
        status: 'failed', 
        error: '服务器处理失败：' + (error instanceof Error ? error.message : String(error)) 
      };
    }
  }
}

export default CallPrivateRing;
