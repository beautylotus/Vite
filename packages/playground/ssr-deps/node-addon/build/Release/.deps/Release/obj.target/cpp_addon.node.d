cmd_Release/obj.target/cpp_addon.node := g++ -o Release/obj.target/cpp_addon.node -shared -pthread -rdynamic -m64  -Wl,-soname=cpp_addon.node -Wl,--start-group Release/obj.target/cpp_addon/main.o -Wl,--end-group 
