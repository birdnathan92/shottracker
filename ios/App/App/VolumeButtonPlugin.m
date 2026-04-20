//
//  VolumeButtonPlugin.m
//  Registers the VolumeButtonPlugin class with Capacitor's plugin runtime.
//  Swift classes alone cannot be discovered by the CAP_PLUGIN macro system;
//  this thin Obj-C file is the bridge.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VolumeButtonPlugin, "VolumeButton",
           CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)
