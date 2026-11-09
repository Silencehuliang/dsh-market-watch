/**
 * dsh-plugin-market-watch — Client plugin entry (browser half).
 *
 * M0 最小验证:向 shell.overlay(list 型 slot)注入常驻徽章,
 * 证明客户端 bundle 按 __ModuleLoader__ 约定加载、slot 注册成功。
 */
export const inject = ['slots']

export function apply(ctx: any): void {
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'dsh-plugin-market-watch', order: 10 },
      () => (
        <div style={{ padding: '2px 8px', fontSize: 12, opacity: 0.85 }} title="dsh-plugin-market-watch 已加载">
          📈 market-watch
        </div>
      ),
    ),
  )
}
