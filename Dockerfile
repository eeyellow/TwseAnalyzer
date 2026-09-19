# 使用包含 .NET SDK 的基底映像檔 (為保留原本呼叫專案 cli 等指令架構)
FROM mcr.microsoft.com/dotnet/sdk:10.0

# 安裝 Node.js (用於打包前端 React 專案)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# 設置工作目錄
WORKDIR /app

# 複製所有檔案到容器內
COPY . .

# 執行前端打包
WORKDIR /app/src/TWSE.Web/ClientApp
RUN npm install
RUN npm run build

# 回到專案根目錄，符合應用程式相對於 data 與 strategies 資料夾的預期路徑
WORKDIR /app

# 定義要曝光的 Port
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

# 啟動應用程式
CMD ["dotnet", "run", "--no-launch-profile", "--project", "src/TWSE.Web/TWSE.Web.csproj"]
