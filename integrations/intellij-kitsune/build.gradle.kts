import org.jetbrains.intellij.platform.gradle.TestFrameworkType

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.intellij.platform")
    id("com.gradleup.shadow")
}

group = "com.kitsune.intellij"
version = "0.1.0"

kotlin {
    jvmToolchain(21)
}

dependencies {
    testImplementation("junit:junit:4.13.2")

    intellijPlatform {
        // 以 IDEA Community 作为编译基线，运行时可被 Ultimate / PyCharm / WebStorm 加载
        intellijIdeaCommunity("2025.2.6.2")
        testFramework(TestFrameworkType.Platform.JUnit4)
    }

    // WebSocket 客户端：OkHttp（成熟、轻量）
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // JSON 序列化：IDEA 自带 Gson，relocate 后打入插件 jar 避免冲突
    implementation("com.google.code.gson:gson:2.11.0")
}

// 将 OkHttp / Gson 等第三方依赖 relocate 后打入插件 jar，
// 避免与 IDE 内置或其他插件的同名类冲突
tasks.shadowJar {
    archiveClassifier.set("")
    mergeServiceFiles()
    relocate("okhttp3", "com.kitsune.intellij.deps.okhttp3")
    relocate("okio", "com.kitsune.intellij.deps.okio")
    relocate("com.google.gson", "com.kitsune.intellij.deps.gson")
}

intellijPlatform {
    pluginConfiguration {
        id = "com.kitsune.intellij"
        name = "Kitsune AI"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "242"   // 兼容 2024.2+
            untilBuild = provider { null }  // 不设上限，跟随主版本
        }
    }
    buildSearchableOptions = false
    instrumentCode = true
}
