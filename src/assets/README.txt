这个目录放你自己的图片、字体、PDF 等静态素材。

里面的所有文件都会被原样复制到 docs/assets/ 里，所以：

  放在这里：src/assets/photo.jpg
  文章里写：![一张照片](/assets/photo.jpg)

关于路径写法，有三种，都是可以的：

  1. 以 / 开头（推荐）：![图](/assets/photo.jpg)
     —— 前提是网站部署在域名根目录。如果你部署在
        https://用户名.github.io/仓库名/ 这种子路径下，
        构建脚本会自动把它改写成 /仓库名/assets/photo.jpg。

  2. 相对当前页面：![图](../../assets/photo.jpg)
     —— 两个 ../ 是因为文章地址形如 /posts/文章名/。

  3. 直接把图片拖进 src/assets/，然后运行 npm run build 确认能看到。

小提示：图片建议先压缩再放进来。这个项目不做任何图片处理，
放进来多大，访客就要下载多大。
