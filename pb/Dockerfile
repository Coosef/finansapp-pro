# FinansApp Pro — özel PocketBase imajı
# Hook'lar ve migration'lar imaja gömülür → CasaOS'ta (kaynak dosya olmadan) çalışır.
# Veri (pb_data) kalıcı volume'de tutulur.
#
# Runtime reproducibility: base imaj SÜRÜM + digest ile pinli (asla :latest).
# 0.39.10 = production ile doğrulanmış sürüm (Browser E2E suite bu sürüme karşı koşar).
# Digest = multi-arch OCI index (amd64/arm64/arm-v7) → docker.yml multi-arch build ile uyumlu.
# :latest sürüklenmesi (upstream major geçişi) prod PB'yi bozabilirdi; pin bunu önler.
FROM ghcr.io/muchobien/pocketbase:0.39.10@sha256:dfebd2550d6b5176d67afd3e859f9b642096e624c7f6ada1b5a5bc70a5d21be1

COPY pb_hooks /pb_hooks
COPY pb_migrations /pb_migrations

EXPOSE 8090
