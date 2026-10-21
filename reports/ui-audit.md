# UI 体检报告

- 目标：https://youpin-oa.pages.dev/
- 视口：1440×900 ｜ 页面数：30
- JS 错误：0

| 页面 | 首屏填充率 | 首屏最大空白 | 需滚动 | 横向溢出 | 高行(>90) | 文本裁剪 | 小点击目标 | 大间距(>40) |
|---|---|---|---|---|---|---|---|---|
| 工作台 | 100% | 0px @0 | 1× | 0px | 2 | 1 | 4 | 3 |
| 附件管理 | 100% | 0px @0 | 1× | 0px | 0 | 0 | 0 | 1 |
| 公告列表 | 100% | 0px @0 | 1× | 0px | 0 | 0 | 0 | 1 |
| 我发起的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 2 |
| 预存款管理 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 抵扣(管理专用) | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 1 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 我处理的 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 到账管理(发票) | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 我处理的 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 客户列表 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 2 |
| 公海客户 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 3 |
| 废弃客户 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 3 |
| 客户联系人 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 销售机会 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 跟进记录 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 1 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 我处理的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 样本管理 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 校展预名单 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| 我处理的 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 1 |
| 售前售后查询 | 100% | 0px @0 | 1× | 0px | 1 | 1 | 0 | 1 |
| 我申请的 | 100% | 0px @0 | 1× | 0px | 0 | 1 | 0 | 0 |
| AI问答 | 100% | 0px @0 | 1× | 0px | 0 | 0 | 0 | 3 |
| 产品列表 | 100% | 0px @0 | 1× | 0px | 0 | 2 | 0 | 1 |
| 消息中心 | 100% | 0px @0 | 1× | 0px | 1 | 0 | 0 | 2 |
| 通讯录 | 100% | 0px @0 | 1× | 0px | 0 | 0 | 6 | 2 |

**有问题的页面：30 / 30**

### 工作台
- 大间距 136px@489, 108px@193, 90px@350
- 高行 128px「您参与的订单售后号『ASE20261021995」, 127px「您参与的订单售后号『ASE20261020495」
- 裁剪 div.home-hero x+50 y+90
- 小目标 span.pc-link 32x21, span.pc-link 32x21, span.pc-link 32x21, span.pc-link 32x21
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 附件管理
- 大间距 52px@96
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 公告列表
- 大间距 100px@96
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我发起的
- 大间距 100px@96, 48px@327
- 裁剪 div.pc-table-wrap x+230 y+0
- 越界 table.pc-table@1620, colgroup@1620, col@1620, thead@1620, tr@1620
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 预存款管理
- 裁剪 div.pc-table-wrap x+865 y+0
- 越界 table.pc-table@2255, colgroup@2255, col@1465, col@1665, col@1865
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 裁剪 div.pc-table-wrap x+858 y+0
- 越界 table.pc-table@2256, colgroup@2256, col@1561, col@1706, col@1906
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 抵扣(管理专用)
- 大间距 171px@300
- 裁剪 div.pc-table-wrap x+934 y+0
- 越界 table.pc-table@2332, colgroup@2332, col@1561, col@1706, col@1906
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 大间距 135px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 裁剪 div.pc-table-wrap x+922 y+0
- 越界 table.pc-table@2312, colgroup@2312, col@1596, col@1741, col@1886
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我处理的
- 大间距 241px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 到账管理(发票)
- 裁剪 div.pc-table-wrap x+678 y+0
- 越界 table.pc-table@2076, colgroup@2076, col@1486, col@1686, col@1806
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 裁剪 div.pc-table-wrap x+852 y+0
- 越界 table.pc-table@2242, colgroup@2242, col@1456, col@1656, col@1776
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我处理的
- 大间距 382px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 客户列表
- 大间距 100px@96, 42px@1468
- 裁剪 div.pc-table-wrap x+2090 y+0
- 越界 table.pc-table@3480, colgroup@3480, col@1462, col@1562, col@1672
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 公海客户
- 大间距 100px@96, 53px@843, 52px@770
- 裁剪 div.pc-table-wrap x+2014 y+0
- 越界 table.pc-table@3404, colgroup@3404, col@1462, col@1562, col@1672
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 废弃客户
- 大间距 453px@478, 100px@96, 56px@401
- 裁剪 div.pc-table-wrap x+1930 y+0
- 越界 table.pc-table@3328, colgroup@3328, col@1462, col@1562, col@1672
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 客户联系人
- 裁剪 div.pc-table-wrap x+461 y+0
- 越界 table.pc-table@1851, colgroup@1851, col@1625, col@1851, thead@1851
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 销售机会
- 大间距 590px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 跟进记录
- 大间距 377px@656
- 裁剪 div.pc-table-wrap x+942 y+0
- 越界 table.pc-table@2340, colgroup@2340, col@1485, col@1630, col@1830
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 大间距 697px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我处理的
- 裁剪 div.pc-table-wrap x+1086 y+0
- 越界 table.pc-table@2476, colgroup@2476, col@1480, col@1576, col@1696
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 样本管理
- 裁剪 div.pc-table-wrap x+1108 y+0
- 越界 table.pc-table@2498, colgroup@2498, col@1495, col@1640, col@1760
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 校展预名单
- 裁剪 div.pc-table-wrap x+766 y+0
- 越界 table.pc-table@2156, colgroup@2156, col@1526, col@1646, col@1766
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我处理的
- 大间距 872px@409
- 高行 109px「该模块当前没有数据」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 售前售后查询
- 大间距 100px@96
- 高行 107px「1622891试剂盒售前：20261020690」
- 裁剪 div.pc-table-wrap x+460 y+0
- 越界 table.pc-table@1850, colgroup@1850, col@1530, col@1680, col@1850
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 我申请的
- 裁剪 div.pc-table-wrap x+962 y+0
- 越界 table.pc-table@2352, colgroup@2352, col@1541, col@1686, col@1886
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### AI问答
- 大间距 755px@704, 374px@283, 100px@96
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 产品列表
- 大间距 100px@96
- 裁剪 div.pc-table-wrap x+1505 y+0, span.pc-cell-1.pc-td-sub x+3 y+0
- 越界 table.pc-table@2895, colgroup@2895, col@1510, col@1650, col@1760
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 消息中心
- 大间距 1156px@425, 100px@96
- 高行 109px「加载中…」
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px

### 通讯录
- 大间距 365px@1253, 100px@96
- 小目标 a.pc-link 26x20, a.pc-link 26x20, a.pc-link 26x20, a.pc-link 26x20, a.pc-link 26x20, a.pc-link 26x20
- 小字 em 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px, span.d-nav-arrow 10px
