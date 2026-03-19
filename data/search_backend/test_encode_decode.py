import base64url

url = input()

encoded = base64url.enc(bytes(url, 'utf-8'))

print(encoded)

decoded = base64url.dec(encoded).decode('utf-8')

print(decoded)