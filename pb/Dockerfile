# FinansApp Pro — özel PocketBase imajı
# Hook'lar ve migration'lar imaja gömülür → CasaOS'ta (kaynak dosya olmadan) çalışır.
# Veri (pb_data) kalıcı volume'de tutulur.
FROM ghcr.io/muchobien/pocketbase:latest

COPY pb_hooks /pb_hooks
COPY pb_migrations /pb_migrations

EXPOSE 8090
