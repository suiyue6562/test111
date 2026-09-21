import { Compass, Tags, KeyRound, Gift, MessageSquare, ShieldCheck } from "lucide-react";

const SECTIONS = [
  {
    icon: Compass,
    title: "1. 什么是 API 中转站？",
    body: "API 中转站（聚合站）将多家大模型供应商的接口统一为 OpenAI 兼容格式，你只需一个 Key 即可调用 GPT、Claude、Gemini、DeepSeek 等模型。本站收录并持续监测各中转站的可用性，帮助你避坑。",
  },
  {
    icon: ShieldCheck,
    title: "2. 如何看懂状态监控？",
    body: "每个平台卡片上的彩色方块代表近 30 天的每日状态：绿色为正常、黄色为偏慢、红色为异常、灰色为无数据。「30 天可用率」越高越稳定，「平均延迟」越低响应越快。",
  },
  {
    icon: Tags,
    title: "3. 如何比价？",
    body: "进入「价格筛选」页，选择供应商与具体模型，即可按人民币倍率横向对比各站价格。倍率越低越便宜；同时可参考预估短文/长文花费。建议结合稳定性数据综合选择，不要只看价格。",
  },
  {
    icon: KeyRound,
    title: "4. 如何验证一个 Key 是否可用？",
    body: "使用「Key 检测」工具，输入中转站的 API 地址与 Key，即可实时检测连通性、延迟和可用模型列表。检测仅请求模型列表接口，不消耗对话额度，Key 也不会被保存。",
  },
  {
    icon: Gift,
    title: "5. 如何领取兑换码？",
    body: "「发码活动」页汇集了各站长发放的福利兑换码。注册登录后点击「立即领取」即可获得，注意每个活动有注册天数和领取次数限制。领取记录保存在「我的码包」中。",
  },
  {
    icon: MessageSquare,
    title: "6. 风险提示",
    body: "中转站属于第三方服务，请自行评估风险：不要一次性大额充值、优先选择运营时间长且口碑好的站点、重要业务请做好多渠道备份。如发现跑路或欺诈站点，欢迎在论坛「站务反馈」板块举报。",
  },
];

export default function Guide() {
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-lg font-bold">新手指引</h1>
        <p className="text-sm text-muted-foreground mt-1">五分钟了解如何使用本平台挑选中转站</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold flex items-center gap-2">
              <s.icon className="w-4 h-4 text-indigo-500" /> {s.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 leading-6">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
