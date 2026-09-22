const PAGES: Record<string, { title: string; body: string[] }> = {
  about: {
    title: "关于我们",
    body: [
      "apibuy.top 是一个 AI API 中转站聚合与测评社区——我们不替你买，只帮你选对。哪家中转站稳定、哪家口碑好、哪家适合你的场景，我们一项一项帮你比清楚。",
      "我们持续监测收录站点的可用性与延迟，聚合公开价格信息，并提供真实的用户点评，让选择更简单。",
    ],
  },
  terms: {
    title: "用户协议",
    body: [
      "1. 本站仅提供信息聚合与测评服务，不直接销售任何 API 额度，亦不对第三方站点的服务质量负责。",
      "2. 用户发布的内容（帖子、评论、点评）需遵守法律法规，不得含有欺诈、诽谤、广告刷屏等内容。",
      "3. 站长提交的 API Key 仅用于最低程度的可用性验证，请使用低额度测试 Key。",
      "4. 我们保留对违规内容（含账号）进行删除、隐藏或封禁的权利。",
    ],
  },
  disclaimer: {
    title: "风险声明",
    body: [
      "第三方中转站存在经营风险，可能出现停服、跑路、数据泄露等情况。",
      "请务必控制充值金额、做好数据备份，并优先选择官方渠道用于生产环境。",
      "本站展示的价格与可用性数据来自公开信息与技术监测，仅供参考，不构成任何购买建议。",
    ],
  },
};

export default function StaticPage({ page }: { page: keyof typeof PAGES }) {
  const p = PAGES[page];
  return (
    <div className="max-w-3xl rounded-xl border bg-card p-6 space-y-4">
      <h1 className="text-lg font-bold">{p.title}</h1>
      {p.body.map((b, i) => (
        <p key={i} className="text-sm text-muted-foreground leading-7">{b}</p>
      ))}
    </div>
  );
}
