plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    from(project.layout.projectDirectory.dir("../../..")) {
        include("index.html")
        include("style.css")
        include("vendor/**")
    }
    from(project.layout.projectDirectory.file("../../../app.android.js")) {
        rename { "app.js" }
    }
    into(layout.buildDirectory.dir("generated/web-assets"))
}

android {
    namespace = "com.kf.webrtcphone"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kf.webrtcphone"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web-assets"))
}

configurations.configureEach {
    exclude(group = "androidx.annotation", module = "annotation-experimental")
}

tasks.matching { task ->
    task.name.startsWith("merge") && task.name.endsWith("Assets")
}.configureEach {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core:1.15.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation(platform("com.google.firebase:firebase-bom:34.14.1"))
    implementation("com.google.firebase:firebase-messaging")
}
